// Why: every page talks to the same two Anchor programs; building the clients
//      and PDAs in one place keeps seeds identical to the Rust code.
// How: a read-only Program needs only a Connection; a signing Program wraps the
//      connected wallet in an AnchorProvider. PDAs use the same seeds as
//      programs/*/src/lib.rs: ["oracle"], ["market"], ["position", market, owner].
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import oracleIdl from "@/idl/oracle.json";
import perpIdl from "@/idl/perp.json";
import type { Oracle } from "@/idl/oracle";
import type { Perp } from "@/idl/perp";
import { ORACLE_PROGRAM_ID, PERP_PROGRAM_ID } from "./config";

const withAddress = <T extends { address: string }>(idl: T, id: PublicKey): T => ({ ...idl, address: id.toBase58() });

const readOnlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => { throw new Error("read-only"); },
  signAllTransactions: async () => { throw new Error("read-only"); },
} as unknown as AnchorWallet;

export function oracleProgram(connection: Connection) {
  const provider = new AnchorProvider(connection, readOnlyWallet, { commitment: "confirmed" });
  return new Program<Oracle>(withAddress(oracleIdl as Oracle, ORACLE_PROGRAM_ID), provider);
}

export function perpProgram(connection: Connection, wallet?: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, { commitment: "confirmed" });
  return new Program<Perp>(withAddress(perpIdl as Perp, PERP_PROGRAM_ID), provider);
}

export const ORACLE_PDA = PublicKey.findProgramAddressSync([Buffer.from("oracle")], ORACLE_PROGRAM_ID)[0];
export const MARKET_PDA = PublicKey.findProgramAddressSync([Buffer.from("market")], PERP_PROGRAM_ID)[0];
export const positionPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("position"), MARKET_PDA.toBuffer(), owner.toBuffer()], PERP_PROGRAM_ID)[0];
