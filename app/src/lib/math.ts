// Why: the UI must show the same numbers the perp program will compute
//      (margin, PnL, funding, fees), or users get surprised by failed trades.
// How: a line-for-line mirror of the maths in programs/perp/src/lib.rs, in
//      BigInt so lamport x size products don't lose precision in JS numbers.
//      Sizes are in raw units (SIZE_PRECISION = one slot of blockspace).

export const SIZE_PRECISION = 1_000_000n;
export const FUNDING_PRECISION = 1_000_000n;
export const BPS = 10_000n;
export const SLOTS_PER_DAY = 216_000n;
export const LAMPORTS = 1_000_000_000;

export type MarketParams = {
  initialMarginBps: number;
  maintenanceMarginBps: number;
  liquidationFeeBps: number;
  takerFeeBps: number;
  maxFundingBpsPerDay: number;
  maxPositionSize: bigint;
  maxSkew: bigint;
  maxStalenessSlots: bigint;
};
export type MarketState = {
  params: MarketParams;
  lpBalance: bigint;
  longOi: bigint;
  shortOi: bigint;
  cumulativeFunding: bigint;
  lastFundingSlot: bigint;
};
export type PositionState = {
  collateral: bigint;
  size: bigint;
  entryIndex: bigint;
  lastCumulativeFunding: bigint;
};

const abs = (x: bigint) => (x < 0n ? -x : x);
const clamp = (x: bigint, lo: bigint, hi: bigint) => (x < lo ? lo : x > hi ? hi : x);

/** lamports of exposure: |size| * index / SIZE_PRECISION */
export const notional = (size: bigint, index: bigint) => (abs(size) * index) / SIZE_PRECISION;
export const marginReq = (size: bigint, index: bigint, bps: number) => (notional(size, index) * BigInt(bps)) / BPS;
export const pnl = (size: bigint, entry: bigint, index: bigint) => (size === 0n ? 0n : (size * (index - entry)) / SIZE_PRECISION);
export const takerFee = (delta: bigint, index: bigint, bps: number) => (notional(delta, index) * BigInt(bps)) / BPS;

/** cumulative funding the program would reach if someone touched the market at `slot` */
export function projectedCumulativeFunding(m: MarketState, index: bigint, slot: bigint) {
  let elapsed = slot > m.lastFundingSlot ? slot - m.lastFundingSlot : 0n;
  if (elapsed > SLOTS_PER_DAY) elapsed = SLOTS_PER_DAY;
  if (elapsed === 0n || m.params.maxSkew === 0n) return m.cumulativeFunding;
  const skew = clamp(m.longOi - m.shortOi, -m.params.maxSkew, m.params.maxSkew);
  const delta = (index * FUNDING_PRECISION * BigInt(m.params.maxFundingBpsPerDay) * skew * elapsed) / (BPS * SLOTS_PER_DAY * m.params.maxSkew);
  return m.cumulativeFunding + delta;
}

/** funding rate per day as a fraction of notional; positive = longs pay */
export function fundingRatePerDay(m: MarketState) {
  if (m.params.maxSkew === 0n) return 0;
  const skew = clamp(m.longOi - m.shortOi, -m.params.maxSkew, m.params.maxSkew);
  return (m.params.maxFundingBpsPerDay / 10_000) * (Number(skew) / Number(m.params.maxSkew));
}

export type Health = {
  unrealized: bigint;
  funding: bigint;
  equity: bigint;
  notional: bigint;
  maintenance: bigint;
  initial: bigint;
  /** equity / maintenance; below 1 = liquidatable */
  ratio: number;
  leverage: number;
  liqIndex: number | null;
  withdrawable: bigint;
};

export function health(p: PositionState, m: MarketState, index: bigint, slot: bigint): Health {
  const unrealized = pnl(p.size, p.entryIndex, index);
  const cum = projectedCumulativeFunding(m, index, slot);
  const funding = (p.size * (cum - p.lastCumulativeFunding)) / (SIZE_PRECISION * FUNDING_PRECISION);
  const equity = p.collateral + unrealized - funding;
  const n = notional(p.size, index);
  const maintenance = marginReq(p.size, index, m.params.maintenanceMarginBps);
  const initial = marginReq(p.size, index, m.params.initialMarginBps);
  const ratio = maintenance === 0n ? Infinity : Number(equity) / Number(maintenance);
  const leverage = equity > 0n ? Number(n) / Number(equity) : n > 0n ? Infinity : 0;
  const withdrawable = equity - initial > 0n ? equity - initial : 0n;
  return { unrealized, funding, equity, notional: n, maintenance, initial, ratio, leverage, liqIndex: liquidationIndex(p.size, p.entryIndex, equity - unrealized, m.params.maintenanceMarginBps), withdrawable };
}

/** index (lamports/slot) at which equity == maintenance margin, holding collateral and funding fixed */
export function liquidationIndex(size: bigint, entry: bigint, baseEquity: bigint, maintBps: number): number | null {
  if (size === 0n) return null;
  const s = Number(size) / Number(SIZE_PRECISION);
  const m = maintBps / 10_000;
  const C = Number(baseEquity);
  const E = Number(entry);
  const I = s > 0 ? (s * E - C) / ((1 - m) * s) : (C - s * E) / (-s * (1 + m));
  return I > 0 ? I : 0;
}

/** what a trade needs, checked the same way trade() checks it */
export function previewTrade(p: PositionState | null, m: MarketState, index: bigint, slot: bigint, delta: bigint) {
  const pos = p ?? { collateral: 0n, size: 0n, entryIndex: index, lastCumulativeFunding: m.cumulativeFunding };
  const h = health(pos, m, index, slot);
  const newSize = pos.size + delta;
  const fee = takerFee(delta, index, m.params.takerFeeBps);
  const increasing = abs(newSize) > abs(pos.size) || (pos.size !== 0n && newSize !== 0n && (newSize > 0n) !== (pos.size > 0n));
  const required = increasing ? marginReq(newSize, index, m.params.initialMarginBps) : 0n;
  const equityAfter = h.equity - fee;
  const shortfall = required + fee - h.equity > 0n ? required + fee - h.equity : 0n;
  const overLimit = increasing && abs(newSize) > m.params.maxPositionSize;
  const skewBefore = m.longOi - m.shortOi;
  const skewAfter = skewBefore - pos.size + newSize;
  const overSkew = abs(skewAfter) > abs(skewBefore) && abs(skewAfter) > m.params.maxSkew;
  return {
    newSize, fee, increasing, required, equityAfter, shortfall, overLimit, overSkew,
    notional: notional(newSize, index),
    liqIndex: liquidationIndex(newSize, index, equityAfter - pnl(newSize, index, index), m.params.maintenanceMarginBps),
  };
}

export const toBig = (v: { toString(): string } | bigint | number) => BigInt(v.toString());
export const solToLamports = (sol: number) => BigInt(Math.round(sol * LAMPORTS));
export const slotsToRaw = (slots: number) => BigInt(Math.round(slots * Number(SIZE_PRECISION)));
export const rawToSlots = (raw: bigint) => Number(raw) / Number(SIZE_PRECISION);
