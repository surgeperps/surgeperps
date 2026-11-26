// Why: the keeper should not sign with the deploy wallet, which can also
//      upgrade both programs. This hands the oracle to a separate keeper key,
//      so only that key ever has to live on a server.
// How: signs set_authority(NEW_AUTHORITY) with the CURRENT authority
//      (KEYPAIR_PATH, default ~/.config/solana/id.json) on PUBLISH_RPC_URL
//      (devnet by default), then reads the oracle back to confirm.
//        NEW_AUTHORITY=<keeper pubkey> npm run set-authority
//      Dry run (prints what it would do, sends nothing): add DRY_RUN=1.
import { Connection, PublicKey } from "@solana/web3.js";
import { Publisher, loadAuthority, oraclePda, setAuthority } from "./publish.js";

async function main() {
  const next = process.env.NEW_AUTHORITY;
  if (!next) throw new Error("Set NEW_AUTHORITY to the keeper's public key");
  const nextKey = new PublicKey(next);
  delete process.env.KEYPAIR_JSON; // always sign with the local deploy wallet file
  const current = await loadAuthority();
  const url = process.env.PUBLISH_RPC_URL ?? "https://api.devnet.solana.com";
  const conn = new Connection(url, "confirmed");
  const pub = new Publisher(current, url);
  const before = await pub.read();
  if (!before) throw new Error(`No oracle account at ${(await oraclePda()).toBase58()} on ${url}`);
  console.log("cluster   ", url);
  console.log("oracle    ", (await oraclePda()).toBase58());
  console.log("authority ", before.authority.toBase58(), "(now)");
  console.log("signer    ", current.publicKey.toBase58());
  console.log("new       ", nextKey.toBase58());
  if (before.authority.equals(nextKey)) return console.log("Already set. Nothing to do.");
  if (!before.authority.equals(current.publicKey)) throw new Error("The signer is not the current oracle authority");
  if (process.env.DRY_RUN === "1") return console.log("DRY_RUN=1: not sending.");
  const sig = await setAuthority(conn, current, nextKey);
  const after = await pub.read();
  console.log("sent      ", sig);
  console.log("authority ", after?.authority.toBase58(), "(after)");
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
