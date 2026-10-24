# Self-Storage Unit Mix Optimizer

A free browser tool for self-storage owners and developers: **type the rentable area and, for each unit size, its rate, occupancy and how many units the market will rent, and get the exact mix of sizes that earns the most net operating income.** It compares the result with your current plan and shows what 1,000 more or fewer square feet is worth. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/self-storage-unit-mix-optimizer/

After using this, you can **walk into a feasibility or lender conversation with the unit mix that maximises income under your own demand limits**, which used to take a spreadsheet and trial and error.

## Model

- Net income of a unit = rate x 12 x occupancy x (1 - operating cost share) - extra cost per unit.
- Choose counts per size, between a minimum and the market ceiling, so total square feet fit and total net income is largest. This is a bounded knapsack, solved exactly by dynamic programming over square feet (in steps of the gcd of the unit sizes), so awkward leftovers are used well rather than rounded greedily.
- The value of area is the change in the optimum when the area changes by 1,000 sq ft.

Not modelled: construction cost, layout, hallways, rate or occupancy changes over time, concessions, financing, tax.

## Run

Open `index.html` through any static server. Tests: `node --test` (includes a brute-force cross-check of the optimizer).

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
