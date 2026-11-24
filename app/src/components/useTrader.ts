"use client";
// Why: every button that moves money (open account, deposit, trade, close,
//      withdraw) should send transactions the same way and report the result
//      the same way.
// How: builds the Perp instructions from the connected wallet, passes all
//      accounts explicitly (same PDAs as the Rust code), bundles "open account
//      + deposit + trade" into one transaction when needed, and wraps each
//      call in pending / success / error toasts. Every transaction is simulated
//      on our RPC first, so a program error (stale index, not enough margin…)
//      is shown in plain words before the wallet is asked; then the wallet
//      signs and sends it (Phantom's recommended signAndSendTransaction path).
import { useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { MARKET_PDA, ORACLE_PDA, perpProgram, positionPda } from "@/lib/programs";
import { friendlyError } from "@/lib/errors";
import { useToast } from "./Toasts";
import { useSurge } from "./SurgeData";

export function useTrader(onDone?: () => void) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { sendTransaction } = useWallet();
  const { push, update } = useToast();
  const { refreshMarket } = useSurge();
  const [busy, setBusy] = useState(false);
  const prog = useMemo(() => (wallet ? perpProgram(connection, wallet) : null), [connection, wallet]);

  async function run(title: string, send: () => Promise<string>) {
    const id = push({ kind: "pending", title, body: "Confirm in your wallet…" });
    setBusy(true);
    try {
      const sig = await send();
      update(id, { kind: "success", title: title + " · confirmed", body: undefined, sig });
      await refreshMarket();
      onDone?.();
      return sig;
    } catch (e) {
      update(id, { kind: "error", title: title + " failed", body: friendlyError(e) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** simulate, then let the wallet sign and send, then wait for confirmation */
  async function sendTx(tx: Transaction): Promise<string> {
    if (!wallet) throw new Error("Connect a wallet first");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      const err = new Error(JSON.stringify(sim.value.err)) as Error & { logs?: string[] };
      err.logs = sim.value.logs ?? [];
      throw err;
    }
    const sig = await sendTransaction(tx, connection);
    const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error(JSON.stringify(conf.value.err));
    return sig;
  }

  const accounts = () => {
    if (!wallet) throw new Error("Connect a wallet first");
    const owner = wallet.publicKey;
    return { owner, market: MARKET_PDA, position: positionPda(owner), oracle: ORACLE_PDA, systemProgram: SystemProgram.programId };
  };

  /** open the account if needed, add collateral if asked, then change size by `delta` (raw units) */
  async function trade(delta: bigint, depositLamports: bigint, hasAccount: boolean, label: string) {
    if (!prog) return null;
    return run(label, async () => {
      const a = accounts();
      const pre: TransactionInstruction[] = [];
      if (!hasAccount) pre.push(await prog.methods.openPosition().accountsPartial({ market: a.market, position: a.position, owner: a.owner, systemProgram: a.systemProgram }).instruction());
      if (depositLamports > 0n) pre.push(await prog.methods.deposit(new BN(depositLamports.toString())).accountsPartial({ market: a.market, position: a.position, owner: a.owner, systemProgram: a.systemProgram }).instruction());
      return prog.methods.trade(new BN(delta.toString())).accountsPartial({ market: a.market, position: a.position, oracle: a.oracle, owner: a.owner }).preInstructions(pre).transaction().then(sendTx);
    });
  }

  async function deposit(lamports: bigint, hasAccount: boolean) {
    if (!prog) return null;
    return run("Deposit", async () => {
      const a = accounts();
      const pre: TransactionInstruction[] = [];
      if (!hasAccount) pre.push(await prog.methods.openPosition().accountsPartial({ market: a.market, position: a.position, owner: a.owner, systemProgram: a.systemProgram }).instruction());
      return prog.methods.deposit(new BN(lamports.toString())).accountsPartial({ market: a.market, position: a.position, owner: a.owner, systemProgram: a.systemProgram }).preInstructions(pre).transaction().then(sendTx);
    });
  }

  async function withdraw(lamports: bigint) {
    if (!prog) return null;
    return run("Withdraw", async () => {
      const a = accounts();
      return prog.methods.withdraw(new BN(lamports.toString())).accountsPartial({ market: a.market, position: a.position, oracle: a.oracle, owner: a.owner }).transaction().then(sendTx);
    });
  }

  return { ready: !!prog, busy, trade, deposit, withdraw };
}
