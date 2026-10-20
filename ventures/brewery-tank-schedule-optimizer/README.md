# Brewery Tank Schedule Optimizer

A free browser tool for craft and nano breweries: **enter your fermenters, bright tanks and beers, and get the brew-day and tank plan that finishes the most margin.** It books a fermenter and a bright tank for every batch (with cleaning days), respects your brewhouse limit, and shows how busy each tank is, how the plan compares with brewing in rotation, an upper bound on any plan, and what one more tank would add. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/brewery-tank-schedule-optimizer/

After using this, you can **see whether a new fermenter would pay for itself and what to brew next**, which used to take a whiteboard and guesswork.

## Model

- Time is whole days over 1 to 26 weeks. Brewing is allowed on the first N days of each week, up to M brews a day.
- A batch holds one fermenter (big enough for it) for its fermenting days plus cleaning, then, if it conditions, one bright tank for its conditioning days plus cleaning. Only batches that finish inside the horizon count. A batch fills a whole tank slot; there is no double-batching.
- Search: a priority order of batches is decoded by "earliest feasible start, smallest tank that fits", and the order is improved by seeded local search (deterministic). Minimum batch counts per beer are enforced as a hard preference; a shortfall is reported.
- Every plan is checked by an independent feasibility validator before it is shown.
- Upper bound: the least of three relaxations (pooled fermenter days, pooled bright-tank days, brew slots) solved as fractional knapsacks. It is a ceiling, usually loose, not a target.
- "One more tank" re-plans with an extra tank of the largest size. Margin only, before the tank's cost.

Not modelled: demand and seasonality, packaging lines, tank cross-use between beers, double brews into one fermenter, labor, rush orders. The search is not exact; on small cases it is tested against exhaustive search.

## Run

Open `index.html` through any static server. Tests: `node --test`.

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
