// Why: after `anchor deploy` the programs exist but hold no state. Before anyone can trade, the
//      oracle account, the market account and the liquidity pool have to be created once.
// How: run with the deploy wallet (it becomes oracle authority and market admin):
//        npm run setup:devnet              (or: RPC_URL=http://127.0.0.1:8899 npm run setup)
//      Safe to re-run: each step is skipped when already done. LP_SOL (default 2) is how much SOL
//      to add to the pool, and it is only added when the pool is empty.
//      Market settings are the ones the tests, the explainer video and the frontend use.

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Oracle } from "../target/types/oracle";
import type { Perp } from "../target/types/perp";

const SLOT = 1_000_000; // perp size units per slot of blockspace

const PARAMS = {
  initialMarginBps: 5000, // 50%
  maintenanceMarginBps: 2500, // 25%
  liquidationFeeBps: 500, // 5%
  takerFeeBps: 10, // 0.1%
  maxFundingBpsPerDay: 100, // 1% a day at full skew
  maxPositionSize: new BN(5_000 * SLOT),
  maxSkew: new BN(20_000 * SLOT),
  maxStalenessSlots: new BN(150), // ~60 s
};

async function main() {
  const url = process.env.RPC_URL ?? "https://api.devnet.solana.com";
  const walletPath = (process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json").replace(/^~/, os.homedir());
  const lpSol = Number(process.env.LP_SOL ?? "2");

  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const provider = new anchor.AnchorProvider(new Connection(url, "confirmed"), new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl", `${name}.json`), "utf8"));
  const oracle = new Program<Oracle>(idl("oracle"), provider);
  const perp = new Program<Perp>(idl("perp"), provider);

  const [oraclePda] = PublicKey.findProgramAddressSync([Buffer.from("oracle")], oracle.programId);
  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market")], perp.programId);

  console.log("cluster     ", url);
  console.log("wallet      ", payer.publicKey.toBase58(), `(${(await provider.connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL)`);

  // 1. oracle
  let o = await oracle.account.oracle.fetchNullable(oraclePda);
  if (!o) {
    const sig = await oracle.methods.initialize().rpc();
    console.log("oracle      created", sig);
    o = await oracle.account.oracle.fetch(oraclePda);
  } else {
    console.log("oracle      exists");
  }
  if (!o.authority.equals(payer.publicKey)) {
    console.warn(`  warning: oracle authority is ${o.authority.toBase58()}, not this wallet; the keeper must sign with that key`);
  }

  // 2. market
  let m = await perp.account.market.fetchNullable(marketPda);
  if (!m) {
    const sig = await perp.methods.initializeMarket(PARAMS).accountsPartial({ market: marketPda, oracle: oraclePda }).rpc();
    console.log("market      created", sig);
    m = await perp.account.market.fetch(marketPda);
  } else {
    console.log("market      exists");
  }

  // 3. liquidity pool
  if (m.lpBalance.toNumber() <= 0 && lpSol > 0) {
    const sig = await perp.methods.fundLp(new BN(lpSol * LAMPORTS_PER_SOL)).accountsPartial({ market: marketPda }).rpc();
    console.log(`lp          funded ${lpSol} SOL`, sig);
    m = await perp.account.market.fetch(marketPda);
  } else {
    console.log("lp          already funded");
  }

  o = await oracle.account.oracle.fetch(oraclePda);
  console.log("\noracle PDA  ", oraclePda.toBase58(), `index ${o.index.toString()} lamports/slot, last update slot ${o.lastUpdateSlot.toString()}`);
  console.log("market PDA  ", marketPda.toBase58(), `LP ${m.lpBalance.toNumber() / LAMPORTS_PER_SOL} SOL`);
  console.log("params      ", JSON.stringify({ ...m.params, maxPositionSize: m.params.maxPositionSize.toString(), maxSkew: m.params.maxSkew.toString(), maxStalenessSlots: m.params.maxStalenessSlots.toString() }));
  if (o.index.isZero()) console.log("\nNext: start the keeper so the oracle has an index; trades are rejected until it does.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
