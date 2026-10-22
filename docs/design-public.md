<!--
Why: the public version of the design. The full notes (manipulation analysis, open questions)
     stay private in the project's docs/design.md; only what you're happy to publish goes here.
How: copy sections across by hand once they're settled. Draft below; review before pushing.
-->

# Surge design (public)

## How Solana blockspace is paid for

|  | Priority fee | Jito tip |
| --- | --- | --- |
| How it's set | Compute-unit price × compute units | A separate transfer to a tip account |
| Who gets it | The leader validator | The leader validator, shared with its stakers |
| Who uses it | Almost everyone | Bots, snipers, market makers, apps with MEV protection |

## The index

- The keeper computes two sub-indices: priority fees and Jito tips.
- The perp settles on one combined index, a fixed-weight sum of the two. Weights come from trailing-365-day spend share (about 79% priority fees / 21% tips) and are reset on a schedule, not live.
- Both sub-indices are published on their own.

## Architecture

![Architecture](architecture.png)
