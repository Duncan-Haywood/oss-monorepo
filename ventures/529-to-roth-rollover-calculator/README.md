# 529 to Roth IRA Rollover Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/529-to-roth-rollover-calculator/>

A free browser tool: **type a 529 balance, what was added in the last five years and the beneficiary's income, and get a
year-by-year plan for rolling leftover 529 money into the beneficiary's Roth IRA.** Nothing is uploaded.

After using this, you can **see how much can move, in which years, and what it could grow to**, instead of reading
SECURE 2.0 summaries and doing the five-year-lock arithmetic by hand.

## Model

- The 529 must have been open for the same beneficiary at least 15 years before any rollover.
- Contributions from the last five years, and their growth, stay locked until each is five full years old.
- Each year: min(Roth IRA limit - other IRA contributions, earned income, lifetime cap left, eligible balance).
- Lifetime cap $35,000. The whole account grows at one typed rate; no new 529 contributions are assumed.
- Compares with a non-qualified withdrawal (income tax + 10% on the earnings share) and shows the Roth value at retirement.

Limits are inputs (defaults are placeholders). IRS guidance is still developing: check it before moving money.
Not modelled: state recapture of deductions, beneficiary changes, investment choice.

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
