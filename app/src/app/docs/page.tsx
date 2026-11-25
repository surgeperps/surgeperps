"use client";
// Why: traders, hedgers and judges need one place that explains what SurgePerps
//      is, how to use each page, and the exact maths the programs run, so
//      nobody has to read Rust to trust a number on screen.
// How: a long single page with a sticky contents list (scroll-spy via
//      IntersectionObserver). Formulas mirror programs/perp/src/lib.rs and
//      programs/oracle/src/lib.rs; worked examples use the deployed market
//      settings. Live settings and addresses come from <MarketInfo>, and the
//      calculator runs the same functions as the trade ticket (lib/math.ts).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSurge } from "@/components/SurgeData";
import { MarketInfo } from "@/components/MarketInfo";
import { LAMPORTS, liquidationIndex, marginReq, notional, slotsToRaw, solToLamports, takerFee } from "@/lib/math";
import { INDEX_BASELINE } from "@/lib/config";

const TOC: [string, string][] = [
  ["overview", "What SurgePerps is"],
  ["flow", "How it works"],
  ["start", "Getting started"],
  ["trade", "Using the trade desk"],
  ["hedge", "Using the hedge app"],
  ["index", "The index maths"],
  ["position", "Size, exposure and PnL"],
  ["margin", "Margin and liquidation"],
  ["funding", "Funding"],
  ["fees", "Fees"],
  ["calc", "Try the maths"],
  ["safety", "Safety rails"],
  ["kai", "Meet Kai"],
  ["live", "Live settings and addresses"],
  ["glossary", "Glossary"],
];

// settings the devnet market was created with (docs/deployments.md); used when the live market isn't loaded
const DEFAULTS = { initialMarginBps: 5000, maintenanceMarginBps: 2500, liquidationFeeBps: 500, takerFeeBps: 10, maxFundingBpsPerDay: 100 };

function F({ children }: { children: ReactNode }) {
  return <pre className="formula mono">{children}</pre>;
}
function Sec({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card pad doc-sec">
      <div className="doc-n mono">{String(n).padStart(2, "0")}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  const { market } = useSurge();
  const [active, setActive] = useState(TOC[0][0]);
  const p = market?.params ?? DEFAULTS;
  const im = p.initialMarginBps / 100, mm = p.maintenanceMarginBps / 100, lf = p.liquidationFeeBps / 100, tf = p.takerFeeBps / 100, mf = p.maxFundingBpsPerDay / 100;

  useEffect(() => {
    const els = TOC.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-90px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="stack reveal">
      <section className="card pad doc-hero">
        <div className="eyebrow">Docs</div>
        <h1>How SurgePerps works</h1>
        <p className="muted lead">Perpetual futures on the cost of Solana blockspace. This page covers what the product does, how to use each screen, and every formula the on-chain programs run, with worked examples.</p>
      </section>

      <div className="doc-grid">
        <nav className="doc-toc" aria-label="On this page">
          <small>On this page</small>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? "on" : ""}>{label}</a>
          ))}
        </nav>

        <div className="stack doc-body">
          <Sec id="overview" n={1} title="What SurgePerps is">
            <p>Every Solana transaction pays for blockspace: a <b>priority fee</b> to get scheduled sooner, and often a <b>Jito tip</b> to land in a bundle. When the network gets busy, during a hot mint, a launch or a liquidation wave, these costs can multiply within minutes.</p>
            <p>SurgePerps turns that cost into one public number, the <b>Surge fee index</b>, and lets you take a position on it:</p>
            <ul className="doc-list">
              <li><b>Long</b> if you think blockspace gets more expensive. Apps that pay their users&apos; fees go long to <b>hedge</b> their gas bill.</li>
              <li><b>Short</b> if you think fees will calm down. Validators, whose income rises with fees, can short to lock in income.</li>
            </ul>
            <p>It is a <b>perpetual</b>: there is no expiry. You hold a position as long as you like, it is marked to the index continuously, and a small funding payment keeps longs and shorts balanced.</p>
            <div className="note">Runs on Solana <b>devnet</b> today: collateral is devnet SOL with no real value. The index itself is measured from real <b>mainnet</b> blocks.</div>
          </Sec>

          <Sec id="flow" n={2} title="How it works">
            <div className="flow" role="list">
              <div className="flow-step" role="listitem"><b>Mainnet blocks</b><span>Every block&apos;s transactions, fees and tip transfers</span></div>
              <div className="flow-arrow" aria-hidden="true">→</div>
              <div className="flow-step" role="listitem"><b>Keeper</b><span>Measures P and T per block, takes medians over the last 100 slots</span></div>
              <div className="flow-arrow" aria-hidden="true">→</div>
              <div className="flow-step hi" role="listitem"><b>Oracle program</b><span>Stores P and T and combines them into the index, stamped with the slot</span></div>
              <div className="flow-arrow" aria-hidden="true">→</div>
              <div className="flow-step" role="listitem"><b>Perp program</b><span>Fills trades at the index, holds collateral, settles PnL and funding</span></div>
            </div>
            <ol className="doc-list">
              <li><b>The keeper</b> is an off-chain bot. It reads each new mainnet block, sums the priority fees and Jito tips in it, and keeps a rolling window of the last 100 slots.</li>
              <li>About every 10 seconds it sends the two medians to the <b>oracle program</b>, which only accepts updates from its authority key. The oracle computes the combined index itself, so the weighting can&apos;t differ between the bot and the chain.</li>
              <li>The <b>perp program</b> reads the oracle on every action. It refuses to trade if the index is older than the allowed staleness (150 slots, about a minute), so a stopped keeper pauses trading instead of filling at an old price.</li>
              <li>A <b>liquidity pool</b> (LP) inside the market account takes the other side of every trade. It earns taker fees and pays or receives trader PnL.</li>
              <li>This website reads the oracle and market accounts live and sends your transactions through your wallet. It never holds your keys or funds.</li>
            </ol>
          </Sec>

          <Sec id="start" n={3} title="Getting started">
            <ol className="doc-list">
              <li>Install a Solana wallet such as <b>Phantom</b> or <b>Solflare</b> and switch it to <b>Devnet</b> (in Phantom: Settings → Developer settings → Testnet mode).</li>
              <li>Get free devnet SOL from <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com ↗</a>. 2–5 SOL is plenty.</li>
              <li>Click <b>Select Wallet</b> in the top bar and connect.</li>
              <li>Check the index is live: the pill next to it reads <span className="mono">LIVE · updated N slots ago</span>. If it reads <span className="mono">STALE · trades paused</span>, the keeper hasn&apos;t published recently and trading waits until it does.</li>
            </ol>
          </Sec>

          <Sec id="trade" n={4} title="Using the trade desk">
            <ol className="doc-list">
              <li><b>Pick a side.</b> Long gains when the index rises; short gains when it falls.</li>
              <li><b>Choose a size in slots.</b> One slot means &quot;the fee cost of one block&quot;; the quick buttons fill common sizes.</li>
              <li><b>Add collateral</b> in the ticket (the margin needed is suggested for you), or deposit separately in the collateral card. Your first trade or deposit also creates your position account, which costs a small rent deposit.</li>
              <li><b>Check the preview.</b> Before you sign, the ticket shows the exposure in SOL, margin, taker fee, 24-hour funding and your liquidation index.</li>
              <li><b>Open.</b> Approve in your wallet. A toast and Kai confirm it, with a link to the explorer.</li>
              <li><b>Watch your health.</b> The position panel shows PnL, funding, equity, leverage and a health bar (equity ÷ maintenance margin). Below 1.0× the position can be liquidated.</li>
              <li><b>Reduce 50% or close</b> at any time. Closing settles your PnL into collateral; then <b>withdraw</b> what&apos;s free from the collateral card.</li>
            </ol>
          </Sec>

          <Sec id="hedge" n={5} title="Using the hedge app">
            <p>For apps, wallets and bots that spend SOL on fees every month and don&apos;t want to trade.</p>
            <ol className="doc-list">
              <li>Enter your <b>monthly fee bill</b> today, in SOL.</li>
              <li>Choose <b>how much to hedge</b> (10–100%).</li>
              <li>Surge sizes the long for you and shows the collateral needed, a payoff chart and a scenario table.</li>
              <li><b>Open this hedge</b> takes you to the trade desk with side and size filled in.</li>
            </ol>
            <h3>The sizing maths</h3>
            <F>{`size (slots) = monthly bill ÷ index × hedge %`}</F>
            <p>Why it works: if your bill moves with the index, then bill = k × index for some k. A long of size S gains S × Δindex. With S = bill ÷ index, the gain is bill × Δindex ÷ index, which is exactly how much your bill went up.</p>
            <div className="ex">
              <b>Example.</b> Bill 4 SOL/month, index 0.002 SOL/slot, 100% hedge → size = 4 ÷ 0.002 = <b>2,000 slots</b>. Exposure is 2,000 × 0.002 = 4 SOL, so collateral needed is {im}% × 4 = <b>{(4 * im / 100).toFixed(2)} SOL</b> plus a buffer.
              <br />Fees double to 0.004: the bill becomes 8 SOL, the hedge gains 2,000 × 0.002 = 4 SOL, so the net cost is still <b>4 SOL</b>.
            </div>
            <p className="fine">A perp <b>locks</b> the cost, it does not cap it: if fees halve, the bill saves 2 SOL and the hedge loses about 2 SOL. Funding and taker fees are the price of the cover. The hedge is in SOL, so SOL&apos;s dollar price is not hedged, and your own fees can move differently from the network-wide index.</p>
          </Sec>

          <Sec id="index" n={6} title="The index maths">
            <h3>Per block</h3>
            <p>For each mainnet block the keeper adds up, over all transactions:</p>
            <F>{`priority fee (tx) = total fee − 5,000 lamports × signatures
P_block = Σ priority fee (tx)

tip (tx)  = balance increase on any of Jito's tip accounts
T_block   = Σ tip (tx)`}</F>
            <p>The 5,000 lamports per signature is Solana&apos;s fixed base fee; it doesn&apos;t change with demand, so it is removed. Jito&apos;s tip accounts are fetched from Jito&apos;s block engine when the keeper starts.</p>
            <h3>Over time</h3>
            <F>{`P = median(P_block over the last 100 slots)
T = median(T_block over the last 100 slots)`}</F>
            <p>A <b>median</b>, not an average: one block with a giant tip or one leader stuffing its own block barely moves it. 100 slots is about 40 seconds of chain time, short enough to follow real spikes.</p>
            <h3>Combined, on-chain</h3>
            <F>{`index = (P × w + T × (10,000 − w)) ÷ 10,000      w = 7,900 bps`}</F>
            <p>So the index is <b>79% priority fees and 21% Jito tips</b>, the split of what users actually spent on each over the trailing 365 days. The weight is fixed and reset on a schedule, never live, so nobody can move it by spending. Both P and T are also published on their own.</p>
            <p>The unit is <b>lamports per slot</b> (shown as SOL per slot): what a typical block paid on top of base fees. The &quot;× normal&quot; figure divides by a reference level of {(Number(INDEX_BASELINE) / LAMPORTS).toFixed(6)} SOL/slot, so 2.00× means blocks cost twice the usual.</p>
          </Sec>

          <Sec id="position" n={7} title="Size, exposure and PnL">
            <p>A position&apos;s <b>size</b> is in slots of blockspace. Long is positive, short is negative. On-chain it is stored × 1,000,000 (<span className="mono">SIZE_PRECISION</span>) so fractions of a slot work.</p>
            <F>{`exposure (notional) = |size| × index
PnL                 = size × (index_now − index_entry)`}</F>
            <div className="ex">
              <b>Example.</b> Long 1,000 slots at index 0.002 SOL/slot → exposure = <b>2 SOL</b>.
              <br />Index rises to 0.003 → PnL = 1,000 × 0.001 = <b>+1 SOL</b>. Had you been short, it would be −1 SOL.
            </div>
            <p>Positions are <b>marked to market</b> every time they&apos;re touched (trade, deposit, withdraw, liquidation): PnL and funding move into your collateral, and the entry index resets to the current index. Your equity between touches is:</p>
            <F>{`equity = collateral + unrealised PnL − funding owed`}</F>
          </Sec>

          <Sec id="margin" n={8} title="Margin and liquidation">
            <F>{`initial margin     = exposure × ${im}%     needed to add exposure or withdraw
maintenance margin = exposure × ${mm}%     below this, anyone can liquidate
max leverage       = 1 ÷ ${im}% = ${(100 / im).toFixed(1)}×`}</F>
            <p>Margins are high on purpose: the fee index can jump 10× or more in minutes, far faster than most assets. To <b>increase</b> a position (or flip sides), collateral after the move must cover initial margin. Reducing or closing is always allowed.</p>
            <h3>Health</h3>
            <F>{`health = equity ÷ maintenance margin       liquidatable when health < 1`}</F>
            <h3>Liquidation index</h3>
            <p>Holding collateral C fixed, size s (slots), entry E and maintenance rate m, the index I at which equity equals maintenance margin is:</p>
            <F>{`long :  C + s(I − E) = m·s·I     →  I = (s·E − C) ÷ ((1 − m)·s)
short:  C + s(I − E) = m·|s|·I   →  I = (C − s·E) ÷ (|s|·(1 + m))`}</F>
            <div className="ex">
              <b>Example.</b> 1,000 slots at 0.002, collateral 1.198 SOL (1.2 deposited minus the 0.002 taker fee), m = {mm}%.
              <br />Long: I = (2 − 1.198) ÷ (0.75 × 1,000) = <b>0.001069</b>, a 47% fall.
              <br />Short: I = (1.198 + 2) ÷ (1,000 × 1.25) = <b>0.002558</b>, only a 28% rise.
              <br />Shorts get closer to liquidation for the same move, because fees can spike far more than they can fall. Size shorts carefully.
            </div>
            <h3>What happens at liquidation</h3>
            <ol className="doc-list">
              <li>Anyone can call <span className="mono">liquidate</span> on an under-margined position. The program re-checks the condition at the current index.</li>
              <li>The whole position is closed at the index.</li>
              <li>The liquidator earns <b>{lf}% of the exposure</b>, capped at whatever collateral is left. The rest of the collateral stays yours to withdraw.</li>
              <li>If collateral went negative (bad debt), the liquidity pool absorbs the loss.</li>
            </ol>
          </Sec>

          <Sec id="funding" n={9} title="Funding">
            <p>The liquidity pool takes the other side of every trade. If everyone is long, the pool is short a lot of blockspace. Funding charges the crowded side and pays the other, which pulls the market back toward balance.</p>
            <F>{`skew          = long OI − short OI          (clamped to ± max skew)
rate per day  = ${mf}% × skew ÷ max skew        (positive: longs pay shorts)
you pay       = size × index × rate × days`}</F>
            <p>On-chain this is tracked as one running number, <span className="mono">cumulative_funding</span>, that grows every slot by <span className="mono">index × rate ÷ 216,000</span> (slots per day). A position owes <span className="mono">size × (cumulative_now − cumulative_at_last_touch)</span>, settled each time it&apos;s touched. At most one day is accrued per update, and anyone can call <span className="mono">crank_funding</span> to bring it up to date.</p>
            <div className="ex">
              <b>Example.</b> Max skew 20,000 slots. Longs exceed shorts by 5,000 slots → rate = {mf}% × 5,000 ÷ 20,000 = <b>{(mf / 4).toFixed(2)}% per day</b>.
              <br />A long of 1,000 slots at 0.002 (exposure 2 SOL) pays 2 × {(mf / 4).toFixed(2)}% = <b>{(2 * mf / 400).toFixed(3)} SOL per day</b>; a short of the same size earns it.
            </div>
          </Sec>

          <Sec id="fees" n={10} title="Fees">
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Fee</th><th>Rate</th><th>Charged on</th><th>Goes to</th></tr></thead>
              <tbody>
                <tr><td>Taker fee</td><td className="mono">{tf}%</td><td>exposure traded, each open, increase, reduce or close</td><td>Liquidity pool</td></tr>
                <tr><td>Liquidation fee</td><td className="mono">{lf}%</td><td>exposure closed, only when liquidated</td><td>The liquidator</td></tr>
                <tr><td>Funding</td><td className="mono">0 to ±{mf}% / day</td><td>exposure held, depends on skew</td><td>The other side</td></tr>
                <tr><td>Solana network fee</td><td className="mono">~0.000005 SOL</td><td>each transaction</td><td>Validators</td></tr>
              </tbody>
            </table></div>
            <p className="fine">Example: opening 1,000 slots at 0.002 (2 SOL exposure) costs 2 × {tf}% = {(2 * tf / 100).toFixed(3)} SOL in taker fee.</p>
          </Sec>

          <Sec id="calc" n={11} title="Try the maths">
            <p className="muted">Same functions the trade ticket uses. Change the inputs to see margin, fee and liquidation index for any position.</p>
            <Calc p={p} />
          </Sec>

          <Sec id="safety" n={12} title="Safety rails">
            <ul className="doc-list">
              <li><b>Stale index → no trades.</b> Every trade, withdrawal and liquidation checks the oracle is no older than the staleness limit. If the keeper stops, the market pauses rather than filling at an old price.</li>
              <li><b>Position limit and skew cap.</b> A validator could pay fees into its own blocks to push the index, and get most of that money back. Medians make that harder; capping each position and the total long/short imbalance limits what anyone could win by trying.</li>
              <li><b>Fixed weights.</b> The 79/21 split can only change on a schedule, from the oracle&apos;s authority.</li>
              <li><b>One writer for the index.</b> Only the oracle&apos;s authority key can publish. Every update is an on-chain event anyone can audit; the index chart is rebuilt from those events.</li>
              <li><b>Checked maths.</b> All amounts use integer lamports with overflow checks; the UI mirrors the program&apos;s maths in BigInt so previews match what the chain will do.</li>
            </ul>
          </Sec>

          <Sec id="kai" n={13} title="Meet Kai">
            <p>Kai is the little character in the bottom-right corner. Kai reads out what happens: trades confirming or failing, deposits, big index moves, a stale oracle, and a position getting close to liquidation. Kai explains each page the first time you open it.</p>
            <ul className="doc-list">
              <li>Click Kai to say hi.</li>
              <li>The speaker button mutes or unmutes Kai&apos;s voice.</li>
              <li>The arrow button tucks Kai away; click the small face to bring Kai back. Both settings are remembered.</li>
            </ul>
          </Sec>

          <Sec id="live" n={14} title="Live settings and addresses">
            <p className="muted">Read directly from the market and oracle accounts on this network. Every address links to the explorer.</p>
            <MarketInfo />
          </Sec>

          <Sec id="glossary" n={15} title="Glossary">
            <dl className="gloss">
              <div><dt>Slot</dt><dd>One block opportunity on Solana, about 400 ms. Also the unit of position size.</dd></div>
              <div><dt>Lamport</dt><dd>The smallest unit of SOL: 1 SOL = 1,000,000,000 lamports.</dd></div>
              <div><dt>Priority fee</dt><dd>Compute-unit price × compute units, paid to get scheduled sooner.</dd></div>
              <div><dt>Jito tip</dt><dd>A transfer to one of Jito&apos;s tip accounts, paid to land a bundle.</dd></div>
              <div><dt>Keeper</dt><dd>The bot that measures blocks and publishes the index.</dd></div>
              <div><dt>Oracle</dt><dd>The on-chain account holding the latest index.</dd></div>
              <div><dt>Open interest (OI)</dt><dd>Total size of all long (or short) positions.</dd></div>
              <div><dt>Skew</dt><dd>Long OI minus short OI.</dd></div>
              <div><dt>bps</dt><dd>Basis points: 100 bps = 1%.</dd></div>
            </dl>
            <div className="doc-cta">
              <Link className="btn primary" href="/trade">Open the trade desk</Link>
              <Link className="btn ghost" href="/hedge">Size a hedge</Link>
            </div>
          </Sec>
        </div>
      </div>
    </div>
  );
}

type P = { initialMarginBps: number; maintenanceMarginBps: number; takerFeeBps: number };

function Calc({ p }: { p: P }) {
  const { oracle } = useSurge();
  const [side, setSide] = useState<"long" | "short">("long");
  const [sizeStr, setSize] = useState("1000");
  const [colStr, setCol] = useState("1.2");
  const live = oracle ? (Number(oracle.index) / LAMPORTS).toFixed(6) : "0.002";
  const [idxStr, setIdx] = useState<string | null>(null);
  const idxShown = idxStr ?? live;

  const r = useMemo(() => {
    const slots = Math.max(0, Number(sizeStr) || 0);
    const idx = Math.max(0, Number(idxShown) || 0);
    if (!slots || !idx) return null;
    const size = slotsToRaw(slots) * (side === "long" ? 1n : -1n);
    const index = solToLamports(idx);
    const col = solToLamports(Math.max(0, Number(colStr) || 0));
    const fee = takerFee(size, index, p.takerFeeBps);
    const after = col - fee;
    const liq = liquidationIndex(size, index, after, p.maintenanceMarginBps);
    const n = notional(size, index);
    const init = marginReq(size, index, p.initialMarginBps);
    return {
      n: Number(n) / LAMPORTS,
      init: Number(init) / LAMPORTS,
      maint: Number(marginReq(size, index, p.maintenanceMarginBps)) / LAMPORTS,
      fee: Number(fee) / LAMPORTS,
      lev: after > 0n ? Number(n) / Number(after) : Infinity,
      ok: after >= init,
      liq: liq == null ? null : liq / LAMPORTS,
      move: liq == null ? null : (liq / Number(index) - 1) * 100,
      x2: slots * idx,
    };
  }, [side, sizeStr, colStr, idxShown, p]);

  const num = (v: string) => v.replace(/[^0-9.]/g, "");
  return (
    <div className="calc">
      <div className="calc-in">
        <div className="side-seg" data-side={side} role="radiogroup" aria-label="Side">
          <button type="button" role="radio" aria-checked={side === "long"} className={side === "long" ? "long on" : "long"} onClick={() => setSide("long")}>Long</button>
          <button type="button" role="radio" aria-checked={side === "short"} className={side === "short" ? "short on" : "short"} onClick={() => setSide("short")}>Short</button>
        </div>
        <label className="field-lbl" htmlFor="c-size">Size</label>
        <div className="input"><input id="c-size" inputMode="decimal" value={sizeStr} onChange={(e) => setSize(num(e.target.value))} /><span className="unit">slots</span></div>
        <label className="field-lbl" htmlFor="c-col">Collateral</label>
        <div className="input"><input id="c-col" inputMode="decimal" value={colStr} onChange={(e) => setCol(num(e.target.value))} /><span className="unit">SOL</span></div>
        <label className="field-lbl" htmlFor="c-idx">Entry index {idxStr == null && oracle ? "(live)" : ""}</label>
        <div className="input"><input id="c-idx" inputMode="decimal" value={idxShown} onChange={(e) => setIdx(num(e.target.value))} /><span className="unit">SOL/slot</span></div>
      </div>
      <dl className="summary calc-out">
        <div><dt>Exposure</dt><dd className="mono">{r ? r.n.toFixed(4) : "—"} SOL</dd></div>
        <div><dt>Initial margin needed</dt><dd className={`mono ${r && !r.ok ? "red" : ""}`}>{r ? r.init.toFixed(4) : "—"} SOL{r && !r.ok ? " · not enough collateral" : ""}</dd></div>
        <div><dt>Maintenance margin</dt><dd className="mono">{r ? r.maint.toFixed(4) : "—"} SOL</dd></div>
        <div><dt>Taker fee</dt><dd className="mono">{r ? r.fee.toFixed(4) : "—"} SOL</dd></div>
        <div><dt>Leverage</dt><dd className="mono">{r ? (isFinite(r.lev) ? r.lev.toFixed(2) + "×" : "—") : "—"}</dd></div>
        <div><dt>Liquidation index</dt><dd className="mono">{r && r.liq != null ? `${r.liq.toFixed(6)} (${r.move! >= 0 ? "+" : ""}${r.move!.toFixed(1)}%)` : "—"}</dd></div>
        <div><dt>PnL if the index doubles</dt><dd className={`mono ${side === "long" ? "orange" : "red"}`}>{r ? `${side === "long" ? "+" : "−"}${r.x2.toFixed(4)} SOL` : "—"}</dd></div>
      </dl>
    </div>
  );
}
