# Surety Bond Capacity Calculator

A free browser tool for contractors who bid bonded work: **price the performance and payment bond into each bid, check it against your single-job and aggregate bonding limits, see when it will fit, and choose which bids to submit.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/surety-bond-capacity-calculator/

After using this, you can **stop discovering at award time that the bond or the limit kills the job**: see what each bid really costs with the premium recovered, which bids are over your limit today or ever at your working capital, and which combination of bids gives the most expected profit without risking more wins than your surety will carry.

## Model

- **Premium.** A rate per $1,000 of contract price, charged slice by slice through five tiers (breakpoints and rates are editable), then a credit adjustment and an optional minimum. The defaults are placeholders in the shape of a common manual schedule, not anyone's real rates.
- **Bond-inclusive price.** The premium is part of the price it is charged on, so the price `P` is found by bisection on `P(1 - m) - premium(P) - C = 0`, where `C` is your direct cost and `m` your margin on the final price.
- **Limits.** Single job is working capital times a multiple; aggregate is working capital times a larger multiple. Headroom is the aggregate minus the uncompleted share of current bonded contracts.
- **Burn-down.** Each current job's backlog falls in a straight line to zero over the months you give. A bid's first fitting month is the first whole month it fits both limits if nothing else is won.
- **Which bids.** Every subset of bids is enumerated. For each, expected profit is the sum of win chance times profit, and the chance of overcommitting is computed exactly over every win/lose outcome. The tool reports the best set at zero risk, the best set within your tolerance, and the bid-on-everything baseline. A randomised test compares the search against an independent recursion.
- **Working capital needed** is the larger of price / single multiple and (backlog + price) / aggregate multiple.

Not modelled: retainage and cash flow, collateral, bid bond terms, joint ventures, partial wins, jobs that finish late or early, and how a surety actually underwrites.

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
