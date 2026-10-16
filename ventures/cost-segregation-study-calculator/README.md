# Cost Segregation Study Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cost-segregation-study-calculator/>

A free browser tool for owners of rental and commercial property: **estimate what a cost segregation study could
save in year one, and whether it still pays after the study fee, passive-loss limits and recapture on sale.**
Nothing is uploaded.

After using this, you can now **decide whether to book a $5,000-$15,000 study before talking to a firm**, which
used to mean taking the firm's year-one number on trust.

## Model (illustrative)

- Depreciable basis = price less land. Baseline: 27.5-year (residential) or 39-year straight line, mid-month.
- A study moves a share of basis to 5-year property and 15-year land improvements (typical ranges by property
  type in `calc.mjs`, overridable). Bonus depreciation at the rate entered (100% default); the rest on MACRS
  half-year tables.
- Tax saved = extra deduction x bracket, with a "usable now" share for passive-loss limits (the rest is carried
  and released on a taxable sale).
- Recapture on sale: reclassified property at the ordinary rate, building at up to 25%; optional deferral for a
  1031 exchange. Net is shown undiscounted and in present value.

Not modelled: state conformity, AMT, section 179, mid-quarter convention, Form 3115 look-back, NIIT.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace an engineer, a cost segregation
firm or a qualified professional. **You are responsible for reviewing and verifying its output before relying on
it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`study_estimated`, `example_loaded`) are kept
only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
