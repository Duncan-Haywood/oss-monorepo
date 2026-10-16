# PSLF vs Refinance Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pslf-vs-refinance-calculator/>

A free browser tool for borrowers with federal student loans working in public service: **enter your loan,
your income and a private refinance offer, and see the total paid under Public Service Loan Forgiveness,
the balance forgiven, the income at which refinancing starts to win, and what leaving public service early
costs.** Nothing is uploaded.

After using this, you can now **see in dollars whether a refinance offer beats staying federal for PSLF**,
which used to take a spreadsheet with an income-driven payment schedule, a forgiveness date and a
break-even you had to guess at.

## Model

- Income-driven payment each year = plan % x max(0, income - multiple x poverty guideline) / 12, capped at the
  10-year standard payment if chosen. Unpaid interest is added to the balance.
- After 120 minus payments-already-made qualifying payments the balance is forgiven.
- Refinance = level payment over the term. Early exit = income-driven payments, then a 10-year schedule.
- The plan percentage, protected-income multiple and poverty guideline are inputs, not embedded rules.

Not modelled: taxes on forgiveness, exact plan rules, spousal income and filing status, employer
eligibility, lender fees, and the value of federal protections given up by refinancing.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of the U.S. Department of Education, loan servicers and lenders; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
