"use client";
// Why: the trade page needs the connected wallet's position (collateral,
//      size, entry) and must update the moment a trade lands.
// How: derives the Position PDA from the wallet, fetches it, and subscribes
//      to account changes; returns null until the user opens an account.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { perpProgram, positionPda } from "@/lib/programs";
import { toBig, type PositionState } from "@/lib/math";

export function usePosition(enabled: boolean) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const prog = useMemo(() => perpProgram(connection), [connection]);
  const [position, setPosition] = useState<PositionState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pda = useMemo(() => (publicKey ? positionPda(publicKey) : null), [publicKey]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const decode = (a: any): PositionState => ({
    collateral: toBig(a.collateral), size: toBig(a.size), entryIndex: toBig(a.entryIndex), lastCumulativeFunding: toBig(a.lastCumulativeFunding),
  });

  const refresh = useCallback(async () => {
    if (!pda || !enabled) { setPosition(null); setLoaded(true); return; }
    try {
      const a = await prog.account.position.fetchNullable(pda);
      setPosition(a ? decode(a) : null);
    } catch { setPosition(null); }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pda, enabled, prog]);

  useEffect(() => {
    setLoaded(false);
    refresh();
    if (!pda || !enabled) return;
    const id = connection.onAccountChange(pda, (info) => {
      try { setPosition(decode(prog.coder.accounts.decode("position", info.data))); } catch {}
    }, { commitment: "confirmed" });
    return () => { connection.removeAccountChangeListener(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pda, enabled, connection]);

  return { position, loaded, pda, refresh };
}
