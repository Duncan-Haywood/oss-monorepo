# Wash Sale Checker

Free, private browser tool for traders and their accountants: paste trades from all your accounts, and see which losses are wash sales, the loss still claimable, losses permanently lost to IRA repurchases, adjusted basis for replacement shares, Form 8949 code W figures and the first safe re-buy date.

**Live tool:** https://marisstella.app/wash-sale-checker/

Open `index.html`. Tests: `node --test 'ventures/wash-sale-checker/**/*.test.mjs'`.

Not tax advice. Matches identical tickers only. See `VENTURE.yaml`.

An `Account` column marks a row as a retirement account when it holds one of the words IRA, Roth, SEP, HSA, Retirement, 401(k) or 403(b) as a whole token ("Roth IRA", "SEP-IRA", "ROTH_IRA", "Company 401k"). An account number that only contains those digits ("Z40123456") or a name like "September Growth" stays taxable. Before 2026-11-13 a substring test read those as IRAs and skipped their sales.

Column headers are matched by preference, not position: "Trade Date" (or "Run Date", "Activity Date") wins over a "Settlement Date" or "Process Date" that comes first, since the 30-day window runs from the trade date. "Security Type" and "Account Type" are never read as the symbol or the action, and an action such as "Stock split" no longer counts as a sale because it starts with "sto". Robinhood's "Instrument" and "Trans Code" headers are read. Before 2026-11-13 the first header containing "date", "security" or "type" won, which on a settlement-first export could report a wash sale 29 days out that was really 31 days by trade date.
