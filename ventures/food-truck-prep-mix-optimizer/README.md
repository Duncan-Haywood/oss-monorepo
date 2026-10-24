# Food Truck Prep Mix Optimizer

A free browser tool for food trucks, pop-ups and market stalls: **type your prep minutes, grill or fryer minutes and ingredient cash, then each menu item's price, food cost, times and expected demand, and get the exact prep plan with the highest contribution.** It compares the result with your current plan and prices one more prep minute, one more station minute and one more ingredient dollar (shadow prices). Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/food-truck-prep-mix-optimizer/

After using this, you can **see which limit is really capping a service, and what a helper, a second fryer or more cash is worth**, which used to take a spreadsheet Solver run almost no truck owner sets up.

## Model

- Contribution per portion = price x (1 - card fee) - food cost. Fixed cost for the service is a total and does not change the plan.
- Choose portions per item, between a floor and a ceiling (expected demand), so prep minutes, station minutes and ingredient cash stay within limits and total contribution is largest. This is a linear program, solved exactly by the simplex method (Bland's rule, so it cannot cycle).
- Shadow prices are the dual values of the labor, station and cash limits. A left-out item shows the contribution per portion it would need to earn a place.

Not modelled: waste and leftovers, spoilage, food-safety holding times, queue length, weather, permits, tax, financing, portion rounding.

## Run

Open `index.html` through any static server. Tests: `node --test` (includes a randomised cross-check of the optimizer against feasible plans).

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
