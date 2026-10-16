# 401(k) Loan vs Withdrawal Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/401k-loan-vs-withdrawal-calculator/>

A free browser tool: **type the cash you need and your 401(k) details, and see what a 401(k) loan, an early
withdrawal and an outside loan each cost you at retirement.** Nothing is uploaded.

After using this, you can **see which way of getting the cash leaves you with the most, how the answer moves with
investment growth, and what the loan costs if you leave your job**, instead of trusting "you pay the interest to yourself".

## Model

- One yardstick: how much less you hold, after tax, at the horizon than if you had not needed the cash.
- Loan: principal leaves the account; payments (principal + interest) return to it but are paid from after-tax cash.
- Withdrawal: grossed up for income tax and penalty so you net the cash needed; the gross amount leaves for good.
- Outside loan: typed APR and term; the retirement account is untouched.
- Plan loan limit: greater of $10,000 or 50% of vested balance, capped at $50,000 (plans can be lower).
- Job-loss check: balance still owed after N months, with tax and penalty if it became a distribution.

All rates are inputs (defaults are placeholders). Not modelled: hardship-specific rules, penalty exceptions beyond the
penalty input, state detail, plan fees other than the set-up fee, employer match paused during a loan.

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
