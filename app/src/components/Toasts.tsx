"use client";
// Why: every transaction needs visible feedback: sent, confirmed with a link
//      to the explorer, or failed with a reason the user can act on.
// How: a small context with push/update; toasts stack bottom-right (above
//      Kai) and success/error ones close themselves after a few seconds.
//      Every toast is also handed to Kai, who acts it out and says it in plain
//      words (and out loud, if the voice is on).
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { explorerTx } from "@/lib/config";
import { usePet, type Mood } from "./pet/PetProvider";

type Kind = "pending" | "success" | "error";
type Toast = { id: number; kind: Kind; title: string; body?: string; sig?: string };
type Ctx = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Omit<Toast, "id">>) => void };
const ToastCtx = createContext<Ctx | null>(null);
export const useToast = () => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside <Toasts>");
  return c;
};

/** what Kai says for a toast: short, human, about the user's money */
function petLine(kind: Kind, title: string, body?: string): { text: string; mood: Mood } {
  const base = title.replace(/ · confirmed$/, "").replace(/ failed$/, "");
  if (kind === "pending") return { text: `${base}: check your wallet and approve it.`, mood: "thinking" };
  if (kind === "error") return { text: `Oh no, that didn't go through. ${body ?? ""}`.trim(), mood: "sad" };
  const m = /^(Long|Short) ([\d,.]+) slots/.exec(base);
  if (m) return { text: m[1] === "Long" ? `Done! You're long ${m[2]} slots. You win if fees go up.` : `Done! You're short ${m[2]} slots. You win if fees go down.`, mood: "excited" };
  if (base === "Close position") return { text: "Position closed! Your PnL is settled into your collateral.", mood: "excited" };
  if (base === "Reduce 50%") return { text: "Cut it in half. Less risk now.", mood: "happy" };
  if (base === "Deposit") return { text: "Collateral added. Your position has more room to breathe.", mood: "happy" };
  if (base === "Withdraw") return { text: "SOL is back in your wallet!", mood: "excited" };
  return { text: `${base} confirmed!`, mood: "happy" };
}

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const pet = usePet();
  const tell = useCallback((t: Partial<Toast>) => {
    if (!t.kind || !t.title) return;
    const { text, mood } = petLine(t.kind, t.title, t.body);
    pet.say(text, { mood, voice: true, link: t.sig ? explorerTx(t.sig) : undefined, ms: t.kind === "pending" ? 20000 : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.say]);
  const close = (id: number) => setList((l) => l.filter((t) => t.id !== id));
  const autoClose = (id: number, kind: Kind) => { if (kind !== "pending") setTimeout(() => close(id), kind === "error" ? 9000 : 6000); };
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { ...t, id }]);
    autoClose(id, t.kind);
    tell(t);
    return id;
  }, [tell]);
  const update = useCallback((id: number, t: Partial<Omit<Toast, "id">>) => {
    setList((l) => l.map((x) => (x.id === id ? { ...x, ...t } : x)));
    if (t.kind) autoClose(id, t.kind);
    tell(t);
  }, [tell]);
  return (
    <ToastCtx.Provider value={{ push, update }}>
      {children}
      <div className={`toasts ${pet.hidden ? "" : "with-pet"}`} role="status" aria-live="polite">
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
