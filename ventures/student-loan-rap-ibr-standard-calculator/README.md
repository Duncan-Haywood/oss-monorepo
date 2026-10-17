# Student Loan RAP vs IBR vs Standard Calculator

A free browser tool: **type your federal loan balance, rate and income and see what the tiered Standard plan,
the Repayment Assistance Plan (RAP) and Income-Based Repayment (IBR) each cost** - first payment, total paid,
amount forgiven, tax on the forgiven amount and net cost - with a PSLF mode and a sensitivity grid for income
growth. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/student-loan-rap-ibr-standard-calculator/

After using this, you can **pick a repayment plan on the numbers** instead of on a servicer's one-plan estimate.

## Model (rules as of October 2026; every figure is an editable default)

- One pooled loan: balance and weighted-average rate. Monthly simulation up to 40 years; income grows once a
  year, the poverty guideline by the inflation figure typed.
- **Standard (tiered):** under $25k 10 years, $25k-$50k 15, $50k-$100k 20, over $100k 25; level payment.
- **RAP:** AGI x band% / 12 - $50 per dependent, $10 minimum. Band: $10k-$20k 1%, rising 1% per $10k to 10%
  above $100k. Unpaid interest is waived; the government matches principal reduction up to the lesser of $50
  or the payment. Forgiveness at 360 payments.
- **IBR:** rate x (AGI - 150% of the poverty guideline) / 12, capped at the 10-year standard payment on the
  starting balance. Unpaid interest accrues without capitalizing. Forgiveness at 240 (10%) or 300 (15%) payments.
- Forgiveness outside PSLF is taxed at the rate typed. PSLF mode stops RAP and IBR at 120 payments, tax-free.

Not modelled: per-loan detail, Parent PLUS, consolidation timing, married-filing-separately, spouse income,
state tax on forgiveness, older plans' interest subsidies, refinancing.

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
