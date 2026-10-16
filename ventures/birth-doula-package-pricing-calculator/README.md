# Birth Doula Package Pricing Calculator

A free browser tool: **type your package price and what a client really costs you (visits, hours at the birth, driving, on-call days, backup cover, overhead) and see your pay per worked hour and the price that reaches your target.** It also shows how a 30-hour labor changes the answer and how many births a year your income goal takes. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/birth-doula-package-pricing-calculator/

After using this, you can **price a birth package from the hourly rate you want**, which used to be a guess against what the doula down the road charges.

## Model

- Worked hours = prenatal and postpartum visits + labor + admin + driving (one round trip per visit and the birth).
- Net per birth = fee - card fee - backup pay on the births a backup attends - mileage - supplies - fee-independent overhead share.
- On-call days carry a dollar value you choose (0 ignores them). The fee for a target hourly rate is exact: net is linear in the fee.

Not modelled: local market rates, sliding scale, add-on services, taxes beyond a set-aside percentage.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, business, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
