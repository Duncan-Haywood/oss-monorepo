# HSA Shoebox Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hsa-shoebox-reimbursement-planner/>

A free browser tool for HSA holders: **paste the medical receipts you paid out of pocket and see your
tax-free withdrawal room today, and what leaving the HSA invested and reimbursing yourself later saves
after tax compared with reimbursing every year.** Nothing is uploaded.

After using this, you can **put a number on the "save your receipts" strategy** instead of trusting a blog
post, and see how big your reimbursable pile really is.

## Model

- Receipt line: date, amount, optional note. Receipts dated before the HSA opened are excluded; a note ending
  in "reimbursed" marks a receipt already taken out.
- Shoebox path: HSA grows at the return you set, plus yearly contributions; receipts pile grows by the new
  bills you pay each year.
- As-you-go path: each year the HSA reimburses that year's bills (and today's pile), and the cash goes into a
  taxable account growing at the same return.
- Edge = HSA(shoebox) - HSA(as-you-go) - taxable account after capital-gains tax = the tax on the growth of
  the reimbursed dollars. Balance beyond the receipts pile is shown with its ordinary-income cost (plus 20%
  under 65) if used for non-medical spending.

Not modelled: dividend tax drag, inflation, state tax on HSA money (CA, NJ), changing rates, eligibility,
whether an expense is qualified.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
