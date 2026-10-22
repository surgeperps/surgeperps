// Why: the oracle is what the perp settles on; if a stranger can write to it, or a write is wrong, every position is wrong.
// How: `anchor test` spins up a local validator, deploys the program and calls its instructions. Grow this into: the keeper can update the index, anyone else is rejected, stale values are detectable.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Oracle } from "../target/types/oracle";

describe("oracle", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.oracle as Program<Oracle>;

  it("Is initialized!", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
