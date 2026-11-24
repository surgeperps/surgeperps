// Why: one place for everything that changes between localnet, devnet and
//      mainnet, so pages never hardcode an RPC URL or program ID.
// How: reads NEXT_PUBLIC_* env vars (see .env.example) and falls back to the
//      program IDs baked into the IDLs and to public devnet.
import { PublicKey } from "@solana/web3.js";
import oracleIdl from "@/idl/oracle.json";
import perpIdl from "@/idl/perp.json";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export const ORACLE_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_ORACLE_ID || oracleIdl.address);
export const PERP_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PERP_ID || perpIdl.address);

/** "Normal" index used for the ×-vs-baseline figure; defaults to the keeper's first live reading (0.005554 SOL/slot). */
export const INDEX_BASELINE = BigInt(process.env.NEXT_PUBLIC_INDEX_BASELINE || "5554000");

export const CLUSTER: "devnet" | "mainnet-beta" | "localnet" | "custom" =
  /devnet/.test(RPC_URL) ? "devnet" : /mainnet/.test(RPC_URL) ? "mainnet-beta" : /localhost|127\.0\.0\.1/.test(RPC_URL) ? "localnet" : "custom";

export function explorerTx(sig: string) {
  const c = CLUSTER === "mainnet-beta" ? "" : CLUSTER === "localnet" ? "?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899" : `?cluster=${CLUSTER === "custom" ? "devnet" : CLUSTER}`;
  return `https://explorer.solana.com/tx/${sig}${c}`;
}
export function explorerAddr(addr: string) {
  const c = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER === "localnet" ? "custom" : "devnet"}`;
  return `https://explorer.solana.com/address/${addr}${c}`;
}

export const LANDING_URL = "https://funny-pepper-476909.framer.app/";
