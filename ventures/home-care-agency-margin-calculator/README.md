# Home Care Agency Margin Calculator

Free, browser-only tool for non-medical home care agencies. Paste one row per payer
(bill rate, billed hours a month, caregiver wage, share paid, days to payment, visit
length, unpaid travel). It loads each wage with payroll tax, workers' comp, overtime
and unbilled drive time, then shows cost, margin and margin percent per billed hour
for each payer, the bill rate that reaches a target margin, what each extra dollar of
wage costs per month, and the refill share at which dropping a payer breaks even.
Rows are payers, never clients or caregivers; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/home-care-agency-margin-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, loaded cost, margin, rate solve, wage-raise cost, refill, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not payroll,
wage-and-hour, tax, insurance or Medicaid billing advice. It does not model
minimum-shift rules, turnover, benefits or program rate floors. Unverified against a
real agency's books: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
