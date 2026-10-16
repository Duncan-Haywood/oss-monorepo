# Self-Employed Health Insurance Deduction Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/self-employed-health-insurance-deduction-calculator/>

A free browser tool for the self-employed: **enter your business profit and the health, Medicare and long-term-care
premiums you paid, and see the Schedule 1 deduction (Form 7206) after the profit ceiling, employer-plan months and
age caps, the income tax it saves, and how the answer moves if profit changes.** Nothing is uploaded.

After using this, you can now **see how much of your premiums you can actually deduct and what it is worth**,
which used to take reading the Form 7206 worksheet and doing the self-employment-tax loop by hand.

## Model (tax year 2026)

- Qualifying premiums = health, dental, vision and Medicare premiums + long-term-care premiums up to the age limit,
  prorated by the months you were not eligible for a subsidized employer plan.
- Ceiling (sole proprietor / partner) = net profit - half of SE tax - retirement-plan contributions for yourself.
  Ceiling (S corp >2% shareholder) = W-2 wages entered.
- Deduction = min(qualifying premiums, ceiling). Tax saved = deduction x (federal marginal + state rate).
- Also solves the profit at which the full premium fits under the ceiling.

Not modelled: the premium tax credit's circular calculation, multiple businesses, additional Medicare tax, the QBI
interaction, Schedule A medical, state differences, month-by-month eligibility. Confirm constants against the IRS
Form 7206 instructions.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the IRS, insurers, marketplaces and tax-software companies; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`deduction_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
