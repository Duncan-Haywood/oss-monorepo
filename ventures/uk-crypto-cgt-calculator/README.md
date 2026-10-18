# UK Crypto CGT Calculator

Free, browser-only tool for UK holders of Bitcoin, Ether and other cryptoassets.
Paste or open a CSV of your buys, sales, swaps and staking income and it applies
HMRC's **same-day rule, 30-day rule and Section 104 pool** to every disposal, shows
which rule matched each one and against which purchase, and estimates each tax
year's capital gains tax after the annual exempt amount. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uk-crypto-cgt-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - CSV parsing with header aliases, UK or ISO dates, the three-step
  matching (same day, next 30 days, pooled average cost), fees, swaps, income,
  charity donations, per-tax-year totals, the exempt amount, brought-forward and
  carried-forward losses, the 30 October 2024 rate change, end-of-year pool
  balances, and CSV export of the working.
- `cli.mjs` - the same engine in a terminal:
  `node cli.mjs --year 2024-25 --income 45000 --disposals-csv working.csv history.csv`.
  Exit 2 on bad usage, 1 when no row could be read.
- `section-104-pooling-crypto-worked-example.html` - guide whose numbers the test
  suite recomputes.

## Scope

Covered: buys, sells, swaps between assets, staking and airdrop receipts entered
at their pound value, charity donations, fees, losses between years.
Not covered: DeFi, NFTs, forks, wrapped tokens, gifts to a spouse, income tax on
staking, trading-income treatment. Prices are yours; none are fetched. The
2026-27 row assumes 2025-26 rules continue.

## What you use today, and what this does differently

- **A spreadsheet:** free and private, but the same-day and 30-day rules are easy to
  get wrong by hand and most templates use plain FIFO, which is not the UK rule.
- **Crypto tax services** (Koinly, CoinTracker, Recap, Awaken and similar): they sync
  exchanges and wallets and produce files for your return, but they want an account,
  your history on their servers, and a fee that rises with transaction count.
- **An adviser:** the right place to settle borderline treatment. This tool gives
  the working to hand them.
- **What this adds:** HMRC's matching order on your own CSV, the rule shown against
  every disposal, an estimate per tax year, a zero-dependency CLI, no signup, no upload.

Not tax advice. MIT licence.
