// Why: lamports, sizes and index values appear on every screen; formatting
//      them one way keeps the numbers consistent and readable.
// How: small pure helpers. SOL with up to 4 decimals, index in SOL per slot
//      with 6 decimals, × vs baseline with 2.
import { INDEX_BASELINE } from "./config";
import { LAMPORTS, rawToSlots } from "./math";

export const sol = (lamports: bigint | number, dp = 4) => {
  const v = Number(lamports) / LAMPORTS;
  return v.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, dp), maximumFractionDigits: dp });
};
export const signedSol = (lamports: bigint | number, dp = 4) => (Number(lamports) > 0 ? "+" : Number(lamports) < 0 ? "−" : "") + sol(Math.abs(Number(lamports)), dp);
export const indexSol = (lamportsPerSlot: bigint | number) => (Number(lamportsPerSlot) / LAMPORTS).toFixed(6);
export const times = (lamportsPerSlot: bigint | number) => (Number(lamportsPerSlot) / Number(INDEX_BASELINE)).toFixed(2) + "×";
export const slots = (raw: bigint) => rawToSlots(raw).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const pct = (x: number, dp = 2) => (x * 100).toFixed(dp) + "%";
export const short = (addr: string) => addr.slice(0, 4) + "…" + addr.slice(-4);
