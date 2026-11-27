// Why: the perp program only trusts the on-chain oracle, and rejects any index older than
//      150 slots (~60 s). Something has to keep writing fresh values there: this file.
// How: builds the oracle's `update_index(priority_index, tip_index)` instruction by hand
//      (8-byte Anchor discriminator from the IDL + two little-endian u64s, in lamports per slot),
//      signs it with the oracle authority key and sends it to PUBLISH_RPC_URL (devnet by default).
//      The keeper reads fees from mainnet (RPC_URL) but publishes wherever the programs live.
//      The oracle program combines P and T on-chain (79/21), so we send the two sub-indices.
import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { rpcUrl } from "./lib.js";

export const ORACLE_PROGRAM_ID = new PublicKey(
  process.env.ORACLE_PROGRAM_ID ?? "DsdJCXmXKXiYPEcWY1u2FFiTNZvsKKwwnUjybpfniPT7",
);
/** The oracle's state account (seed "oracle"). web3.js 3 derives PDAs asynchronously. */
export const oraclePda = async () => (await PublicKey.findProgramAddress([Buffer.from("oracle")], ORACLE_PROGRAM_ID))[0];

// sha256("global:update_index")[0..8], as in target/idl/oracle.json
const UPDATE_INDEX = Buffer.from([102, 132, 25, 95, 6, 162, 53, 33]);

// set_authority(new_authority): sha256("global:set_authority")[0..8], as in target/idl/oracle.json
const SET_AUTHORITY = Buffer.from([133, 250, 37, 21, 110, 163, 26, 121]);

/**
 * The signing key. On a server, KEYPAIR_JSON holds the key itself (the JSON byte
 * array from a keypair file), since hosts take secrets as env vars, not files.
 * Locally, KEYPAIR_PATH points at a keypair file.
 */
export async function loadAuthority(): Promise<Keypair> {
  const inline = process.env.KEYPAIR_JSON?.trim();
  const json = inline || fs.readFileSync((process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json").replace(/^~/, os.homedir()), "utf8");
  return await Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json)));
}

/** Hands the oracle to `next`. Must be signed by the current authority. */
export async function setAuthority(connection: Connection, current: Keypair, next: PublicKey): Promise<string> {
  const ix = new TransactionInstruction({
    programId: ORACLE_PROGRAM_ID,
    keys: [
      { pubkey: await oraclePda(), isSigner: false, isWritable: true },
      { pubkey: current.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([SET_AUTHORITY, Buffer.from(next.toBytes())]),
  });
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), [current], { commitment: "confirmed" });
}

export class Publisher {
  readonly connection: Connection;
  private pda: PublicKey | undefined;
  constructor(
    readonly authority: Keypair,
    url = rpcUrl("PUBLISH_RPC_URL", "https://api.devnet.solana.com"),
  ) {
    this.connection = new Connection(url, "confirmed");
  }

  /** Writes P and T (lamports per slot) to the oracle. Returns the transaction signature. */
  async publish(priority: number, tips: number): Promise<string> {
    const data = Buffer.alloc(24);
    UPDATE_INDEX.copy(data, 0);
    data.writeBigUInt64LE(BigInt(Math.max(0, Math.round(priority))), 8);
    data.writeBigUInt64LE(BigInt(Math.max(0, Math.round(tips))), 16);
    this.pda ??= await oraclePda();
    const ix = new TransactionInstruction({
      programId: ORACLE_PROGRAM_ID,
      keys: [
        { pubkey: this.pda, isSigner: false, isWritable: true },
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }), ix);
    return sendAndConfirmTransaction(this.connection, tx, [this.authority], { commitment: "confirmed" });
  }

  /** Reads back what the oracle holds: P, T and the combined index (lamports per slot). */
  async read() {
    const info = await this.connection.getAccountInfo(await oraclePda());
    if (!info) return null;
    const d = Buffer.from(info.data); // 8 discriminator + 32 authority, then u64 fields
    return {
      authority: new PublicKey(d.subarray(8, 40)),
      priority: d.readBigUInt64LE(40),
      tips: d.readBigUInt64LE(48),
      index: d.readBigUInt64LE(56),
    };
  }
}
