"use client";
// Why: every transaction needs visible feedback: sent, confirmed with a link
//      to the explorer, or failed with a reason the user can act on.
// How: a small context with push/update; toasts stack bottom-right and
//      success/error ones close themselves after a few seconds.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { explorerTx } from "@/lib/config";

type Kind = "pending" | "success" | "error";
type Toast = { id: number; kind: Kind; title: string; body?: string; sig?: string };
type Ctx = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Omit<Toast, "id">>) => void };
const ToastCtx = createContext<Ctx | null>(null);
export const useToast = () => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside <Toasts>");
  return c;
};

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const close = (id: number) => setList((l) => l.filter((t) => t.id !== id));
  const autoClose = (id: number, kind: Kind) => { if (kind !== "pending") setTimeout(() => close(id), kind === "error" ? 9000 : 6000); };
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { ...t, id }]);
    autoClose(id, t.kind);
    return id;
  }, []);
  const update = useCallback((id: number, t: Partial<Omit<Toast, "id">>) => {
    setList((l) => l.map((x) => (x.id === id ? { ...x, ...t } : x)));
    if (t.kind) autoClose(id, t.kind);
  }, []);
  return (
    <ToastCtx.Provider value={{ push, update }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div className="toast-head">
              <span className="toast-dot" aria-hidden="true" />
              <b>{t.title}</b>
              <button type="button" className="toast-x" onClick={() => close(t.id)} aria-label="Dismiss">×</button>
            </div>
            {t.body && <p>{t.body}</p>}
            {t.sig && <a href={explorerTx(t.sig)} target="_blank" rel="noreferrer">View on Solana Explorer ↗</a>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
