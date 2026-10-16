# Farm Crop Mix Optimizer

A free browser tool for row-crop and hay growers: **type your acres, peak-season labor hours and operating capital, then each crop's yield, price, cost and labor, and get the exact acreage plan with the highest gross margin.** It compares the result with your current plan and prices one more acre, one more labor hour and one more dollar of operating capital (shadow prices). Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/farm-crop-mix-optimizer/

After using this, you can **see which limit is actually holding your farm back, and what you could pay to relax it** (a lease, a seasonal hire, a larger operating line), which used to take a spreadsheet Solver run most growers never set up.

## Model

- Margin per acre = yield x price - variable cost. Land cost is a fixed total and does not change the plan.
- Choose acres per crop, between a floor and a ceiling, so total acres, labor hours and operating capital stay within limits and total margin is largest. This is a linear program, solved exactly by the simplex method (Bland's rule, so it cannot cycle).
- Shadow prices are the dual values of the land, labor and capital limits. A left-out crop shows the margin per acre it would need to earn a place.

Not modelled: yield and price risk, rotation agronomy, field sizes, timing, machinery, storage, insurance, programs, tax, financing.

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
