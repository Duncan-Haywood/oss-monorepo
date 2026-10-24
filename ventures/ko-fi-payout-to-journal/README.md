# Ko-fi to Journal

A free browser tool for Ko-fi creators and their bookkeepers: **drop in the Transactions CSV and get a balanced Xero, QuickBooks Online, QuickBooks Desktop (IIF) or plain CSV journal.** The file is read in the browser; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ko-fi-payout-to-journal/

After using this, you can now **book tips, memberships, shop orders and commissions to separate income accounts with the Ko-fi and PayPal/Stripe fee on its own line, split at month end and proven against your deposit**, which used to mean booking the net PayPal deposit as income.

Files: `calc.mjs` (parser, categoriser, journal builders, no DOM, no network), `index.html` (the page), `usage.mjs` (opt-out local counters). Tests: `node --test 'ventures/ko-fi-payout-to-journal/**/*.test.mjs'`.

Unverified: column names and importer layouts are from memory of public help documents; no real Ko-fi export was available.
