// Why: the perp program holds user money; every rule (margin, funding, liquidation, position limits) needs a test before devnet.
// How: `anchor test` spins up a local validator, deploys the program and calls its instructions. Grow this into one test per rule, opening and closing positions against a mocked oracle value.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Perp } from "../target/types/perp";

describe("perp", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.perp as Program<Perp>;

  it("Is initialized!", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
