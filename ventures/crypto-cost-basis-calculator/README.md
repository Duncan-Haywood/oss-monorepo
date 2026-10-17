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
- Wallet-to-wallet transfers (`matchLots` in `calc.mjs`): with per-wallet matching on, a `transfer` row with a `to wallet` column moves lots (purchase date and basis intact, chosen by the selected method) so basis follows the coins; over-transfers are warned, not guessed. Without the column, or with matching off, transfers stay ignored.
- `importers.mjs` - Coinbase, Kraken, Binance.US, Crypto.com App and Gemini export readers that produce the plain CSV `calc.mjs` reads (unpriced rows left empty and flagged, never zero).
- `cli.mjs` - the same matching in a terminal, zero dependencies and no network: `node cli.mjs --method HIFO --year 2024 --form8949 8949.csv coinbase.csv kraken.csv` reads one or more exchange exports (or `-` for stdin), prints gains, the five-method comparison and holdings, and writes Form 8949 style rows; `--json` for scripts, `--per-wallet`, `--short-rate`/`--long-rate`. Exit 2 on bad usage, 1 when no transactions could be read.
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
