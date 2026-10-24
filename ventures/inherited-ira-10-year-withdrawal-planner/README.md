# Inherited IRA 10-Year Withdrawal Planner

Free, private browser tool for people who inherited an IRA from a non-spouse: enter the balance, your growth guess and your other income by year, and get a year-by-year withdrawal plan that empties the account by the 10-year deadline at the lowest federal tax, compared with waiting until year 10 and with equal withdrawals. If the owner had already started required minimum distributions, the yearly minimums are enforced.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/inherited-ira-10-year-withdrawal-planner/

Open `index.html`. Tests: `node --test 'ventures/inherited-ira-10-year-withdrawal-planner/**/*.test.mjs'`.

Not tax advice. Federal ordinary income tax only, 2026 brackets held constant; the life-expectancy factor is approximated unless you enter the IRS Table I figure. See `VENTURE.yaml`.
