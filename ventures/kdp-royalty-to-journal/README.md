# KDP Royalty to Journal

Free, private browser tool: paste an Amazon KDP royalty report / payments CSV and get balanced, month-split journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). Royalties are booked gross by marketplace and format (eBook, paperback, hardcover, KENP page reads), printing cost and tax withheld as expenses, rows in a currency of their own get their own journal (never converted), rows no rule recognises go to an uncategorised account (never dropped), and a per-row Total column or a Total row is checked against the rows. It also shows gross by marketplace and the printing cost as a share of gross.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/kdp-royalty-to-journal/

Open `index.html`. Tests: `node --test 'ventures/kdp-royalty-to-journal/**/*.test.mjs'`.

Column names are alias-matched and have not been verified against a real KDP export; nothing has run against one yet. See `VENTURE.yaml`.
