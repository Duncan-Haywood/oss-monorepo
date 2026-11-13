# Wash Sale Checker

Free, private browser tool for traders and their accountants: paste trades from all your accounts, and see which losses are wash sales, the loss still claimable, losses permanently lost to IRA repurchases, adjusted basis for replacement shares, Form 8949 code W figures and the first safe re-buy date.

**Live tool:** https://marisstella.app/wash-sale-checker/

Open `index.html`. Tests: `node --test 'ventures/wash-sale-checker/**/*.test.mjs'`.

Not tax advice. Matches identical tickers only. See `VENTURE.yaml`.

An `Account` column marks a row as a retirement account when it holds one of the words IRA, Roth, SEP, HSA, Retirement, 401(k) or 403(b) as a whole token ("Roth IRA", "SEP-IRA", "ROTH_IRA", "Company 401k"). An account number that only contains those digits ("Z40123456") or a name like "September Growth" stays taxable. Before 2026-11-13 a substring test read those as IRAs and skipped their sales.
