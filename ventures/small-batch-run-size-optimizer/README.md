# Small-Batch Run Size Optimizer

A free browser tool for small makers who produce in batches: **enter what you sell in a year, what a changeover costs and what stock costs to hold, and get the run size with the lowest yearly cost** for each product. It rounds to your pack or mould size, keeps runs inside shelf life, and shows what the plan saves against the run size you use today. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/small-batch-run-size-optimizer/

After using this, you can **stop picking run sizes by habit**: see the yearly dollars lost to too many changeovers or too much stock, and the range of run sizes that cost almost the same, so you can pick a convenient one.

## Model

- Annual cost of runs of size `Q` is `(S * D / Q) + (H * Q * (1 - d / p)) / 2`: setup cost times runs per year, plus holding cost on the average stock. `D` is yearly demand, `d` average daily sales, `p` daily production rate (the factor is 1 when a whole run arrives at once) and `H` the yearly holding cost per unit (unit cost times the holding rate, plus storage). The unconstrained minimum is the economic production quantity `sqrt(2DS / (H(1 - d/p)))`.
- The run is then limited to the largest batch (vat, oven, supplier), the smallest batch, and the most you can sell before the oldest unit expires (`d` times shelf-life days). Because cost is convex in `Q`, the best whole multiple of the pack size is one of the two multiples either side of the clipped optimum, which the tool checks exactly. A randomised test compares this with exhaustive search.
- If machine or bench hours per year are limited, each changeover hour is charged a price found by bisection until the plan fits. Products with the most changeover hours per unit get the bigger runs. The reported price is the cost avoided by one more hour.

Not modelled: seasonal demand, quantity discounts, stock-outs, shared moulds or ingredients, run sequencing.

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
