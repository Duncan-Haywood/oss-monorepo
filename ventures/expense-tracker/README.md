# Expense Tracker

After using this, you know what your business expenses add up to, how much of
that is deductible on each Schedule C line, which expenses are missing a receipt,
and what to expect to save in tax.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/expense-tracker/

Free, no account, no watermark, works offline. Everything runs in your browser;
entries are stored in `localStorage` on your device and never uploaded.

- Add an expense with date, vendor, amount, Schedule C category, business-use percentage and a receipt flag; repeat monthly for subscriptions and rent
- Import a bank or card CSV (negative amounts or a debit column): money out only, suggested categories you review, duplicates flagged
- Meals count at 50%, personal is zero, mixed use scales by business-use percentage
- Totals by Schedule C line, by month and by estimated-tax payment period; planning estimate of tax saved
- Flags expenses of $75 or more with no receipt kept, and large purchases that are usually depreciated
- Printable Schedule C worksheet; formula-safe CSV and JSON backup export
- Money in whole cents (`calc.mjs`)

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.

- Income and profit: reads paid (or sent) invoices from [Invoice Maker](../invoice-maker/) on the same device, read-only, excluding sales tax, then shows net profit and a suggested tax set-aside at your rate
