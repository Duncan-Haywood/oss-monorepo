# ISO Exercise AMT Calculator

A free browser tool for employees with incentive stock options: **enter your income and options and see
how many you can exercise this year before the alternative minimum tax starts, and the AMT and cash
needed if you exercise more.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/iso-exercise-amt-calculator/

After using this, you can now **pick an exercise size that uses your AMT headroom instead of guessing**,
which used to take a tax preparer running Form 6251 by hand at several sizes.

## Model (tax year 2026)

- Regular tax: 2026 brackets on wages - pre-tax deductions - max(standard, itemized).
- AMT income: wages - pre-tax deductions - (itemized minus state and local taxes, if itemizing) + ISO
  spread. The standard deduction is not allowed.
- Exemption $90,100 single / head of household, $140,200 MFJ, reduced 50 cents per dollar over $500,000
  ($1,000,000 MFJ). Tentative minimum tax 26% up to $244,500 above the exemption, 28% beyond.
- AMT = max(0, tentative minimum tax - regular tax). The crossover is the largest spread with AMT = 0,
  found by bisection, converted to options at the (fair market value - strike) spread.
- Cash needed = exercise cost + AMT; ISO exercise has no withholding. AMT paid is described as a credit
  carryforward, as a maximum and not a forecast.

Not modelled: nonqualified options, NIIT, other AMT adjustments, state AMT, other income, the $100,000
ISO limit, other years. Unverified against Form 6251.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the Internal Revenue Service, employers and equity plan administrators.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`amt_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
