# Freelance Dashboard

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-dashboard/>

After using this, you know what you are owed and by whom, what hours you have
worked but not billed, which quotes need a follow-up, what your profit is so
far this year after costs, and what to do first today.

Free, no account, works offline. It only reads what the other tools in this set
already keep in your browser, and never uploads anything.

- Reads [Invoice Maker](../invoice-maker/), [Estimate Maker](../estimate-maker/), [Time Tracker](../time-tracker/) and [Expense Tracker](../expense-tracker/) data from `localStorage` on the same device (read-only)
- "Do this next": overdue invoices, unbilled hours by client, stale quotes, a timer left running, missing receipts, client concentration and an estimated-tax date inside 30 days, ranked by what costs most to ignore
- Money, year to date: receivables, overdue, unbilled, open quotes, paid income, deductible costs, net profit and a set-aside at a percentage you choose (a planning figure, not a tax calculation)
- Monthly income and cost bars; list of unpaid invoices by days late
- One JSON backup and restore for all four tools
- Money in whole cents (`calc.mjs`); the readers mirror each sibling's arithmetic and are deliberately self-contained

Run the tests: `node --test`. Serve `index.html` from any static host next to its sibling tools.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
