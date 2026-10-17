# Crypto Cost Basis Calculator

Free, browser-only tool for anyone who bought, sold or earned crypto at more than
one price. Paste or open a CSV of your own transactions and it matches every sale
to your purchase lots under FIFO, LIFO, HIFO, LOFO or a tax-aware greedy rule,
splits each sale into short-term and long-term rows, compares the methods side by
side with an estimated tax, lists the coins and basis still held, and exports
Form 8949 style rows. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/crypto-cost-basis-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - CSV parsing with exchange-style header aliases, lot matching,
  holding periods, per-wallet books, tax netting and the Form 8949 style export.
- `form8949Totals` in `calc.mjs`: the Part I (short-term) and Part II (long-term) column totals for the report year, shown under the rows, with a count of rows that have no purchase on record.
- Tax-loss harvesting (`parsePrices`, `harvestPlan` in `calc.mjs`): type today's price per coin and it values every open lot, ranks the lots under water by tax saved, and shows how much of the year's estimated tax selling them would remove. Prices are yours; none are fetched; wash-sale rules are not applied.
- `importers.mjs` - Coinbase, Kraken, Binance.US and Crypto.com App export readers that produce the plain CSV `calc.mjs` reads (unpriced rows left empty and flagged, never zero).
- `usage.mjs` - local-only feature counters with an opt-out.
- `fifo-vs-hifo-crypto-cost-basis.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal, tax,
financial or investment advice. It does not fetch prices or connect to exchanges,
and does not model DeFi, NFTs, forks, lost coins, gifts, wash-sale style rules,
state tax, the net investment income tax or loss limits. Which lot-identification
methods you may use depends on your jurisdiction and records. Unverified against a
real tax return: tested on hand-calculated examples and conservation checks.

**Privacy.** Everything runs in your browser; your transactions are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
