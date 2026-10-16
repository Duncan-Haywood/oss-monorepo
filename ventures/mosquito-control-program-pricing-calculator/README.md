# Mosquito Control Program Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mosquito-control-program-pricing-calculator/>

A free browser tool for mosquito barrier-spray operators: **type your product cost, time on site, drive time, free re-treat rate and overhead, and see the lowest price per visit and per prepaid season that leaves your margin** -- plus a price ladder, what a renewing customer is worth, how many customers one truck can serve, and how many it takes to cover startup cost. Nothing is uploaded.

After using this, you can **quote a season program knowing the prepay discount and rain re-treats still leave your margin**, instead of copying a competitor's price.

## Model

- Visit cost = product (sq ft / 1,000 x cost) + applicator time (on site + drive) + truck time (drive) + a free re-treat share.
- Overhead and card fees are a percent of price. Minimum price = direct cost / (1 - fees - wanted margin); with a prepay discount d the list price is divided by (1 - d) again.
- Customer value = season profit x sum of renew^(n-1) over the seasons counted.
- Route: stops per day x days a week x weeks = visits; divided by visits per program = customers one truck serves.

Not modelled: licensing and label rules, taxes, weather swings, price competition, one-off event sprays.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
