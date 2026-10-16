# Fiverr Earnings to Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fiverr-earnings-to-journal/>

Free, private browser tool: paste a Fiverr earnings / transaction history CSV and get balanced, month-split journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). Order revenue and tips are booked gross, Fiverr's 20% service fee and withdrawal fees as expenses, refunds and cancellations as reversals, withdrawals as money moving to the bank, and a running Balance column (if present) is walked row by row to prove no row is missing. If your order rows are already net of the fee, it can gross them up at a percentage you set. It also reports what Fiverr took as a share of what you billed.

Open `index.html`. Tests: `node --test 'ventures/fiverr-earnings-to-journal/**/*.test.mjs'`.

Column names are alias-matched and have not been verified against a real Fiverr export; nothing has run against one yet. See `VENTURE.yaml`.
