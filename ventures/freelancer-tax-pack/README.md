# Freelancer Tax Pack

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelancer-tax-pack/>

After using this, you know your 2026 net profit, what self-employment and federal
tax that implies, what you still owe in quarterly estimates, and which clients
should send you a 1099-NEC, without retyping a number.

Free, no account, no watermark, works offline. Everything runs in your browser.

- Reads, read-only, what [Invoice Maker](../invoice-maker/), [Expense Tracker](../expense-tracker/) and [Mileage Log](../mileage-log/) keep in `localStorage` on the same device; or load their JSON backups
- Schedule C by line: gross receipts (cash or invoice basis, sales tax excluded), expenses by line, standard mileage by trip date, net profit
- Schedule SE tax with the Social Security wage base and W-2 wages, half deducted
- 2026 federal estimate for single or married filing jointly: standard deduction, simple QBI deduction (below the phase-in only), brackets
- Quarterly plan: lesser of 90% of this year's tax or 100% (110% over $150k AGI) of last year's, less withholding, minus payments already made
- 1099-NEC list at the $2,000 threshold; record-gap warnings (unpaid invoices, missing receipts, thin mileage entries, car costs and mileage both claimed)
- Printable worksheet and formula-safe CSV
- Money in whole cents (`calc.mjs`)

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
