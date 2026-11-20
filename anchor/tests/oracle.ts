// Why: the oracle is what the perp settles on; if a stranger can write to it, or a write is wrong, every position is wrong.
// How: `anchor test` spins up a local validator, deploys the program and calls its instructions. Grow this into: the keeper can update the index, anyone else is rejected, stale values are detectable.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Oracle } from "../target/types/oracle";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { BN } from "bn.js";

describe("oracle", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.oracle as Program<Oracle>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    program.programId,
  );

  it("initializes with my wallet as authority and 79/21 weights", async () => {
    await program.methods.initialize().rpc();
    const o = await program.account.oracle.fetch(oraclePda);
    expect(o.authority.toBase58()).to.equal(
      // verify that the oracle is initialized with the wallet that deployed the program as the authority
      provider.wallet.publicKey.toBase58(),
    );
    expect(o.priorityWeightBps).to.equal(7900);
  });

  it("combines the two sub-indices on-chain", async () => {
    // 0.79 * 1,000,000 + 0.21 * 2,000,000 = 1,210,000
    await program.methods
      .updateIndex(new BN(1_000_000), new BN(2_000_000))
      .rpc();
    const o = await program.account.oracle.fetch(oraclePda);
    expect(o.index.toNumber()).to.equal(1_210_000);
  });

  it("rejects an update from a stranger", async () => {
    const stranger = Keypair.generate();
    let failed = false;
    try {
      await program.methods
        .updateIndex(new BN(1), new BN(1))
        .accounts({
          authority: stranger.publicKey,
        })
        .signers([stranger])
        .rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("rejects weights above 100%", async () => {
    let err = "";
    try {
      await program.methods.setWeights(10_001).rpc();
    } catch (e) {
      err = String(e);
    }
    expect(err).to.include("BadWeight");
  });

  it("hands the oracle to a new key and back", async () => {
    const next = Keypair.generate();
    await program.methods.setAuthority(next.publicKey).rpc();
    expect(
      (await program.account.oracle.fetch(oraclePda)).authority.toBase58(),
    ).to.equal(next.publicKey.toBase58());

    // hand back the authority
    await program.methods
      .setAuthority(provider.wallet.publicKey)
      .accounts({ authority: next.publicKey })
      .signers([next])
      .rpc();
  });
});
