// Why: a failed transaction shows raw program logs; users need to know what
//      went wrong and what to do about it.
// How: finds the Anchor error name in the thrown error or its logs and maps it
//      to a plain sentence. Names match the OracleError / PerpError enums.
const MESSAGES: Record<string, string> = {
  StaleOracle: "The fee index is stale: the keeper hasn't published recently. Try again in a minute.",
  OracleNotReady: "The oracle has no index yet. The keeper needs to publish first.",
  InsufficientMargin: "Not enough collateral for this size. Add collateral or trade smaller.",
  InsufficientCollateral: "You can't withdraw more than your collateral.",
  PositionLimit: "That's above the per-position size limit.",
  SkewLimit: "The market is too one-sided for this trade right now. Try a smaller size.",
  InsufficientLp: "The liquidity pool is too small to take this trade.",
  InsufficientVault: "The vault can't pay this out right now.",
  NotLiquidatable: "This position is above maintenance margin.",
  ZeroAmount: "Enter an amount greater than zero.",
  MathOverflow: "That amount is too large.",
  BadParams: "Invalid market parameters.",
  BadWeight: "Weights must be at most 100%.",
};

export function friendlyError(e: unknown): string {
  const err = e as { message?: string; name?: string; logs?: string[]; error?: { message?: string } };
  const text = [String(err?.message ?? e), err?.error?.message ?? "", ...(err?.logs ?? [])].join("\n");
  if (/User rejected|rejected the request/i.test(text)) return "You cancelled the transaction in your wallet.";
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(text)) return "Your wallet doesn't have enough SOL for this (including fees).";
  for (const [name, msg] of Object.entries(MESSAGES)) if (text.includes(name)) return msg;
  if (/^Wallet(Sign|Send)TransactionError$/.test(err?.name ?? "")) {
    return "Your wallet couldn't sign this. Check it is on Devnet (Phantom: Settings → Developer Settings → Testnet Mode, network Solana Devnet) and has devnet SOL, then try again.";
  }
  if (/AccountNotInitialized|could not find account/i.test(text)) return "The market isn't set up on this network yet.";
  return text.split("\n")[0].slice(0, 180);
}
