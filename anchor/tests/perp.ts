// Why: the perp program holds user money; every rule (margin, funding, liquidation, position limits) needs a test before devnet.
// How: `anchor test` spins up a local validator, deploys both programs and runs oracle.ts first, then this file.
//      We drive the oracle index ourselves (update_index with P = T = X gives index X) and walk one story,
//      the same one as the explainer video: Zap goes long 500 slots, a validator goes short 500, fees spike,
//      Zap closes and withdraws its profit, fees double, the validator gets liquidated. Each step checks the
//      numbers against the program's formulas. Funding accrues a few lamports per slot between transactions,
//      so balances that cross slots are compared within a small tolerance (TOL).

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Oracle } from "../target/types/oracle";
import { Perp } from "../target/types/perp";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { BN } from "bn.js";

const SLOT = 1_000_000; // size units per "one slot of blockspace"
const TOL = 1_000_000; // 0.001 SOL: room for funding accrued between transactions

// index values in lamports per slot of blockspace
const I0 = 5_554_000; // 0.005554 SOL
const SPIKE = 8_331_000; // 1.5x
const DOUBLE = 11_108_000; // 2x

const PARAMS = {
  initialMarginBps: 5000,
  maintenanceMarginBps: 2500,
  liquidationFeeBps: 500,
  takerFeeBps: 10,
  maxFundingBpsPerDay: 100,
  maxPositionSize: new BN(5_000 * SLOT),
  maxSkew: new BN(20_000 * SLOT),
  maxStalenessSlots: new BN(150),
};

// lamports of exposure, same formula as notional() in lib.rs
const notional = (slots: number, index: number) => slots * index;

describe("perp", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const conn = provider.connection;

  const oracle = anchor.workspace.oracle as Program<Oracle>;
  const perp = anchor.workspace.perp as Program<Perp>;

  const [oraclePda] = PublicKey.findProgramAddressSync([Buffer.from("oracle")], oracle.programId);
  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market")], perp.programId);
  const positionPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBuffer(), owner.toBuffer()],
      perp.programId,
    )[0];

  const zap = Keypair.generate(); // wallet that pays users' fees: goes long
  const validator = Keypair.generate(); // earns fees: goes short
  const greedy = Keypair.generate(); // tries to break the limits
  const liquidator = Keypair.generate();

  // ---------- helpers ----------

  async function airdrop(to: PublicKey, sol: number) {
    const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  }

  async function setIndex(x: number) {
    await oracle.methods.updateIndex(new BN(x), new BN(x)).rpc();
  }

  async function open(trader: Keypair, depositLamports: number) {
    await perp.methods
      .openPosition()
      .accountsPartial({ market: marketPda, position: positionPda(trader.publicKey), owner: trader.publicKey })
      .signers([trader])
      .rpc();
    await perp.methods
      .deposit(new BN(depositLamports))
      .accountsPartial({ market: marketPda, position: positionPda(trader.publicKey), owner: trader.publicKey })
      .signers([trader])
      .rpc();
  }

  const tradeAccounts = (trader: Keypair) => ({
    market: marketPda,
    position: positionPda(trader.publicKey),
    oracle: oraclePda,
    owner: trader.publicKey,
  });

  function trade(trader: Keypair, slots: number) {
    return perp.methods
      .trade(new BN(slots * SLOT))
      .accountsPartial(tradeAccounts(trader))
      .signers([trader])
      .rpc();
  }

  function withdraw(trader: Keypair, lamports: number) {
    return perp.methods
      .withdraw(new BN(lamports))
      .accountsPartial(tradeAccounts(trader))
      .signers([trader])
      .rpc();
  }

  function liquidate(owner: PublicKey) {
    return perp.methods
      .liquidate()
      .accountsPartial({ market: marketPda, position: positionPda(owner), oracle: oraclePda, liquidator: liquidator.publicKey })
      .signers([liquidator])
      .rpc();
  }

  const position = (owner: PublicKey) => perp.account.position.fetch(positionPda(owner));
  const market = () => perp.account.market.fetch(marketPda);

  async function expectError(p: Promise<unknown>, code: string) {
    let err = "";
    try {
      await p;
    } catch (e) {
      err = String(e);
    }
    expect(err, `expected ${code}`).to.include(code);
  }

  const near = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected), `${actual} vs ${expected}`).to.be.at.most(TOL);

  // ---------- setup ----------

  before(async () => {
    // oracle.ts normally runs first and leaves the oracle initialised with our wallet as authority
    if (!(await oracle.account.oracle.fetchNullable(oraclePda))) {
      await oracle.methods.initialize().rpc();
    }
    await setIndex(I0);

    if (!(await perp.account.market.fetchNullable(marketPda))) {
      await perp.methods.initializeMarket(PARAMS).accountsPartial({ market: marketPda, oracle: oraclePda }).rpc();
    }
    await Promise.all([zap, validator, greedy, liquidator].map((k) => airdrop(k.publicKey, 50)));
  });

  // ---------- tests ----------

  it("creates the market pointing at the oracle, with our settings", async () => {
    const m = await market();
    expect(m.oracle.toBase58()).to.equal(oraclePda.toBase58());
    expect(m.admin.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(m.params.initialMarginBps).to.equal(5000);
    expect(m.params.maintenanceMarginBps).to.equal(2500);
  });

  it("rejects market settings that make no sense", async () => {
    // maintenance margin above initial margin
    await expectError(
      perp.methods.updateParams({ ...PARAMS, maintenanceMarginBps: 6000 }).accountsPartial({ market: marketPda }).rpc(),
      "BadParams",
    );
  });

  it("lets only the admin change settings", async () => {
    const stranger = Keypair.generate();
    let failed = false;
    try {
      await perp.methods
        .updateParams(PARAMS)
        .accountsPartial({ market: marketPda, admin: stranger.publicKey })
        .signers([stranger])
        .rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("funds the liquidity pool", async () => {
    const before = (await market()).lpBalance.toNumber();
    await perp.methods.fundLp(new BN(10 * LAMPORTS_PER_SOL)).accountsPartial({ market: marketPda }).rpc();
    expect((await market()).lpBalance.toNumber()).to.equal(before + 10 * LAMPORTS_PER_SOL);
  });

  it("opens a long and a short at the oracle index, charging the 0.1% taker fee", async () => {
    const fee = (notional(500, I0) * 10) / 10_000; // 2,777,000 lamports

    await open(zap, 2 * LAMPORTS_PER_SOL);
    await trade(zap, 500);
    const z = await position(zap.publicKey);
    expect(z.size.toNumber()).to.equal(500 * SLOT);
    expect(z.entryIndex.toNumber()).to.equal(I0);
    expect(z.collateral.toNumber()).to.equal(2 * LAMPORTS_PER_SOL - fee);

    await open(validator, 4 * LAMPORTS_PER_SOL);
    await trade(validator, -500);
    const v = await position(validator.publicKey);
    expect(v.size.toNumber()).to.equal(-500 * SLOT);
    expect(v.entryIndex.toNumber()).to.equal(I0);
    expect(v.collateral.toNumber()).to.equal(4 * LAMPORTS_PER_SOL - fee);

    const m = await market();
    expect(m.longOi.toNumber()).to.equal(500 * SLOT);
    expect(m.shortOi.toNumber()).to.equal(500 * SLOT);
  });

  it("rejects a trade without enough collateral for initial margin", async () => {
    // 500 slots at 0.005554 needs 1.3885 SOL; greedy only has 0.1
    await open(greedy, 0.1 * LAMPORTS_PER_SOL);
    await expectError(trade(greedy, 500), "InsufficientMargin");
    expect((await position(greedy.publicKey)).size.toNumber()).to.equal(0);
  });

  it("rejects a position above the size limit", async () => {
    await expectError(trade(greedy, 5_001), "PositionLimit");
  });

  it("rejects a withdrawal that would leave the position under-margined", async () => {
    // Zap has ~1.997 SOL against a 1.3885 SOL initial margin requirement
    await expectError(withdraw(zap, 1 * LAMPORTS_PER_SOL), "InsufficientMargin");
  });

  it("refuses a stale oracle", async () => {
    try {
      await perp.methods
        .updateParams({ ...PARAMS, maxStalenessSlots: new BN(0) })
        .accountsPartial({ market: marketPda })
        .rpc();
      await new Promise((r) => setTimeout(r, 1500)); // let a few slots pass
      await expectError(trade(greedy, 1), "StaleOracle");
    } finally {
      await perp.methods.updateParams(PARAMS).accountsPartial({ market: marketPda }).rpc();
    }
  });

  it("refuses to liquidate a healthy position", async () => {
    await setIndex(SPIKE);
    // validator equity ≈ 4 − 0.0028 − 1.3885 = 2.61 SOL vs 1.04 SOL maintenance
    await expectError(liquidate(validator.publicKey), "NotLiquidatable");
  });

  it("fees spike 1.5x: Zap closes, the profit lands in collateral and comes out in SOL", async () => {
    const before = (await position(zap.publicKey)).collateral.toNumber();
    const pnl = 500 * (SPIKE - I0); // +1,388,500,000
    const closeFee = (notional(500, SPIKE) * 10) / 10_000; // 4,165,500

    await trade(zap, -500);
    const z = await position(zap.publicKey);
    expect(z.size.toNumber()).to.equal(0);
    expect(z.entryIndex.toNumber()).to.equal(SPIKE);
    near(z.collateral.toNumber(), before + pnl - closeFee); // ≈ 3.3816 SOL
    expect((await market()).longOi.toNumber()).to.equal(0);

    // withdraw everything: real lamports move from the vault to Zap's wallet
    const wallet = await conn.getBalance(zap.publicKey);
    await withdraw(zap, z.collateral.toNumber());
    expect(await conn.getBalance(zap.publicKey)).to.equal(wallet + z.collateral.toNumber());
    expect((await position(zap.publicKey)).collateral.toNumber()).to.equal(0);
  });

  it("fees double: the validator falls below maintenance and a liquidator closes it for 5%", async () => {
    await setIndex(DOUBLE);
    const v0 = await position(validator.publicKey);
    // equity ≈ 3.9972 − 500 × (0.011108 − 0.005554) = 1.2202 SOL, under the 1.3885 SOL maintenance margin
    const equity = v0.collateral.toNumber() - 500 * (DOUBLE - I0);
    const reward = (notional(500, DOUBLE) * 500) / 10_000; // 277,700,000 = 0.2777 SOL

    const wallet = await conn.getBalance(liquidator.publicKey);
    await liquidate(validator.publicKey);

    expect(await conn.getBalance(liquidator.publicKey)).to.equal(wallet + reward);
    const v = await position(validator.publicKey);
    expect(v.size.toNumber()).to.equal(0);
    near(v.collateral.toNumber(), equity - reward); // ≈ 0.9425 SOL left for the validator
    expect((await market()).shortOi.toNumber()).to.equal(0);
  });

  it("funding: the crowded side pays", async () => {
    await setIndex(I0);
    await trade(greedy, 1); // a lone 1-slot long: longs are the crowded side
    const m0 = await market();
    await new Promise((r) => setTimeout(r, 2000));
    await setIndex(I0); // keep the oracle fresh
    await perp.methods.crankFunding().accountsPartial({ market: marketPda, oracle: oraclePda }).rpc();
    const m1 = await market();
    expect(m1.cumulativeFunding.gt(m0.cumulativeFunding), "longs pay: cumulative funding rises").to.equal(true);
    await trade(greedy, -1);
  });

  it("the vault holds exactly what it owes: LP balance plus every trader's collateral", async () => {
    const info = await conn.getAccountInfo(marketPda);
    const rent = await conn.getMinimumBalanceForRentExemption(info!.data.length);
    const m = await market();
    const owed = await Promise.all([zap, validator, greedy].map(async (k) => (await position(k.publicKey)).collateral.toNumber()));
    expect(info!.lamports - rent).to.equal(m.lpBalance.toNumber() + owed.reduce((a, b) => a + b, 0));
  });
});
