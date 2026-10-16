# Sign Shop Job Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sign-shop-job-pricing-calculator/>

A free browser tool for sign and banner shops: **type the size, quantity, material costs, shop and install time and the margin you want, and get the price that earns it.** It shows break-even, dollars left per shop hour, what the job earns if you match the market price per square foot, and how the price per piece falls with quantity. Nothing is uploaded.

After using this, you can **quote from your own costs** instead of a flat per-square-foot rule that loses money on small, design-heavy or install jobs.

## Model

- Material = area x (1 + waste) x (substrate + print media + laminate) per sq ft.
- Shop hours = print time (material area / sq ft per hour) + finishing (per piece) + design (once per job); labour and overhead are charged per shop hour.
- Install = hours x install rate + travel, only when there is an install.
- Price = cost / (1 - card fee - target margin), never below the minimum charge.

Not modelled: supplier price breaks, sales tax, permits and engineering, rush fees, redrawing artwork.

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
