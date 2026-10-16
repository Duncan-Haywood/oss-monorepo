# Wise Statement to Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wise-statement-to-journal/>

A free browser tool for businesses that hold money in Wise multi-currency balances: **drop in the statement CSV for one currency and get a balanced Xero, QuickBooks Online, QuickBooks Desktop (IIF) or plain CSV journal in your books' currency, with the realised FX gain or loss on its own line.** The file is read in the browser; nothing is uploaded.

After using this, you can now **record money received, sent, card spending, fees and conversions on a Wise balance at base-currency values, with the exchange gain or loss booked separately and the running balance proved row by row**, which used to mean either ignoring FX or building a spreadsheet by hand.

Files: `calc.mjs` (parser, valuation at average cost, journal builders, no DOM, no network), `index.html` (the page), `usage.mjs` (opt-out local counters). Tests: `node --test 'ventures/wise-statement-to-journal/**/*.test.mjs'`.

Unverified: column names, Wise's fee convention and importer layouts are from memory of public help documents; no real Wise statement was available. Rates are typed by the user; nothing is fetched.
