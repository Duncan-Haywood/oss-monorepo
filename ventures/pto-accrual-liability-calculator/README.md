# PTO Accrual Liability Calculator

A free browser tool for small employers: **paste a roster of PTO balances and see what unused vacation costs you today and a year from now**, by employee, with state payout rules and the cost of balances above a target.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pto-accrual-liability-calculator/

After using this, you can **put a dollar figure on accrued PTO, see who is at their cap, and decide whether to set or lower a cap**, which used to be a payroll-report export and a spreadsheet.

## Model

- Liability per employee = balance hours x hourly rate. When payout is owed, it is multiplied by `1 + employer payroll tax %`.
- Payout is treated as owed when the state is on a deliberately short list (CA, CO, IL, MA: statute or controlling case treats earned vacation as wages) and the rule is "use the state rule", or when the user says "always owed". Every other state: written policy decides. The user can override either way.
- Projection: `balance + accrual per period x periods`, stopping at the cap. A balance already over its cap is not reduced. Months to cap uses whole pay periods.
- Target: hours above a comfortable balance, priced the same way.

Not modelled: paid sick leave, final-rate-of-pay rules, local ordinances, union terms, accounting standards, taxes on cash-outs.

Up to 500 employees.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
