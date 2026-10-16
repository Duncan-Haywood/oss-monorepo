# Dependent Care FSA vs Child Care Credit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dependent-care-fsa-vs-credit-calculator/>

A free browser tool for working parents: **enter your childcare spending, income and tax rates, and see
whether a dependent care FSA or the child and dependent care tax credit saves more, and the best split
between the two.** Nothing is uploaded.

After using this, you can now **pick how much to elect in your employer's dependent care FSA, knowing every
FSA dollar shrinks the expenses the credit can use**.

## Model

- FSA: each elected dollar saves federal marginal + state + payroll tax rates (limit $7,500).
- Credit: min(expenses, cap) - FSA, times a rate from 50% down to 20% by AGI (cap $3,000 for one child, $6,000 for two or more). FSA dollars lower AGI.
- Both limited to the lower earner's income; credit optionally limited to tax before credits.
- Every election in $50 steps plus the maximum is tried; the best is shown.

Not modelled: state credits, married filing separately, employer plan limits, grace periods, provider and qualifying-person rules, bracket edges. Confirm current-year figures.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the IRS, employers, FSA administrators and tax software companies; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
