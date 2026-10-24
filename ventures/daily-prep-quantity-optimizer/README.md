# Daily Prep Quantity Optimizer

A free browser tool for bakeries, cafes, food trucks and prepared-food counters: **paste the units each item sold on past days, with price, cost and what a leftover is worth, and get the prep quantity with the highest expected profit.** It shows expected leftovers, the chance of selling out, and what the plan gains over today's prep. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/daily-prep-quantity-optimizer/

After using this, you can **stop prepping by habit**: see which items you over-make (waste) and which you under-make (sold out by mid-afternoon), in dollars.

## Model

- Demand per day is estimated from the days you paste. A day marked with a trailing `+` (for example `51+`) was a sell-out, so demand was at least that many. Those days are treated as censored observations and the demand curve is estimated with the Kaplan-Meier product-limit method. Probability mass left after the last observation is placed at that observation, so the tool never suggests a quantity above your largest recorded day.
- For each item, unit `q+1` is worth prepping while `(price - salvage) * P(demand > q) > cost - salvage` (the newsvendor rule). Marginal profit falls as `q` rises, so the first quantity that fails the test is the exact optimum.
- With a prep-minutes limit or an ingredient budget, every profitable unit is ranked by marginal profit per share of the limit and taken while the limits allow. That ranking is a heuristic: near-best, not guaranteed exact.

Not modelled: weekday, weather and event effects, substitution between items, food-safety holding times, the effect of a stock-out on tomorrow's customers.

## Run

Open `index.html` through any static server. Tests: `node --test` (includes a randomised cross-check of the unconstrained plan against an exhaustive search).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
