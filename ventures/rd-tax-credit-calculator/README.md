# R&D Tax Credit Calculator

A free browser tool for software and engineering startups and small companies: **paste who worked on qualified
research and for how much of their time, add supplies and contractors, and estimate the federal research credit
(Section 41) under both the regular and simplified methods, what Section 280C takes back, and how much could
offset payroll tax.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rd-tax-credit-calculator/

After using this, you can now **tell whether an R&D credit study is worth commissioning, and roughly how much
cash it could return through payroll tax even with no income tax**, which used to take a sales call with a
credit-study firm.

## Model (illustrative)

- QREs = wages x share of time on qualified research + supplies + 65% of US contractor cost.
- Regular credit = 20% x (QREs - base), base = max(fixed-base % x average prior-four-year gross receipts, 50% of QREs).
- Simplified credit = 14% x (QREs - 50% x average of the prior three years), or 6% of QREs if any of those years had none.
- Credit used = the larger. Section 280C cost = credit x the entity's tax rate.
- Payroll offset (qualified small business: under $5 million receipts, first receipts within five years) = up to
  $250,000 against employer Social Security plus up to $250,000 against employer Medicare, capped by payroll tax
  paid; the rest carries forward.

Assumptions are stated in `calc.mjs` and on the page; confirm against IRS instructions for Form 6765.

Not modelled: whether the work qualifies (four-part test), documentation quality, derived fixed-base percentage,
controlled groups, state credits, AMT, Section 174A interaction, pass-through allocation.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified tax professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`credit_estimated`, `example_loaded`) are kept only
in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken
offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
