# Buy Me a Coffee to Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/buymeacoffee-payout-to-journal/>

A free browser tool for Buy Me a Coffee creators and their bookkeepers: **drop in the Transactions CSV and get a balanced Xero, QuickBooks Online, QuickBooks Desktop (IIF) or plain CSV journal.** The file is read in the browser; nothing is uploaded.

After using this, you can now **book tips, memberships, shop orders and commissions to separate income accounts with the Buy Me a Coffee and PayPal/Stripe fee on its own line, split at month end and proven against your deposit**, which used to mean booking the net PayPal deposit as income.

Files: `calc.mjs` (parser, categoriser, journal builders, no DOM, no network), `index.html` (the page), `usage.mjs` (opt-out local counters). Tests: `node --test 'ventures/buymeacoffee-payout-to-journal/**/*.test.mjs'`.

Unverified: column names and importer layouts are from memory of public help documents; no real Buy Me a Coffee export was available.
