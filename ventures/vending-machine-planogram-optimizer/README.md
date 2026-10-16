# Vending Machine Planogram Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/vending-machine-planogram-optimizer/>

A free browser tool for vending operators: **enter the machine's coils, how often you restock, and each product's price, cost, weekly sales and units per coil, and get the split of coils that earns the most.** It shows which products sell out before the next visit, what one more coil is worth, and the best gap between visits after the cost of a trip. Nothing is uploaded.

After using this, you can **stop filling coils evenly by habit**: move coils from slow items to the ones that sell out, and know when an extra coil or an extra visit stops paying.

## Model

- Demand for a product between visits is Poisson with mean (weekly sales x days between visits / 7), independent between products.
- With `k` coils of `u` units, a visit loads `k*u` units; units sold are `min(demand, k*u)`. Profit per visit is margin x units sold. A perishable product's unsold units are thrown out and paid for again at the next fill.
- The best split is found **exactly** by dynamic programming over products and coils, honouring each product's minimum and maximum coils and leaving coils empty when that earns more. The expected units sold use the exact Poisson tail sums. A test compares it with brute force.
- The recommended split and today's layout (or an even split if none is given) are then run on the same 3,000 simulated restock intervals (common random numbers). A share of each sold-out product's unmet demand switches to products still in stock, in proportion to their weekly sales. The gain is the mean of paired differences, with its standard error.
- The restocking table re-optimises the coils for each gap of 2 to 14 days and subtracts the visit cost.

Not modelled: which products fit which coil type, shelf-life limits beyond the perishable flag, location commissions, card-reader fees, price changes, visibility effects of facings, day-of-week or seasonal swings. The optimiser itself ignores substitution, so it can only understate the value of the layout.

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
