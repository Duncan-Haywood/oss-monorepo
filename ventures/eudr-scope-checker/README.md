# EUDR Scope Checker

Free, private browser tool: choose your role (operator, downstream operator, trader) and size, tick the commodities you trade, and see whether Regulation (EU) 2023/1115 (the EU Deforestation Regulation) covers you, your duties with the Article behind each, how country risk changes your due diligence, and your application date. Paste customs codes to screen them against Annex I headings.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/eudr-scope-checker/

After using this, you know whether your coffee, cocoa, rubber, soya, palm, cattle or wood products are in scope, what you must file or keep and by when, which used to take a consultant's first call.

Open `index.html`. Tests: `node --test 'ventures/eudr-scope-checker/**/*.test.mjs'`. `calc.mjs` holds the rules; the page's options mirror its lists and `page.test.mjs` fails if they drift.

**No warranty.** Free and as-is; not legal advice. It reads only what you enter. Dates are those in the Regulation as amended in 2024 and December 2025, and have moved before. See `VENTURE.yaml`.
