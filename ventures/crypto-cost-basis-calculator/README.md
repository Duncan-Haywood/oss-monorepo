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
- Wait-for-long-term (`waitPlan` in `calc.mjs`, shown under the harvesting prices): gains still short-term that turn long-term within 90 days, with the estimated tax saved by waiting and how far the price can fall before selling now would have kept more cash.
- Sell planner (`planSale` in `calc.mjs`, `--sell BTC --price 90000 --qty 0.1` in the CLI): pick a coin, a price you type and either coins or dollars to raise; it picks lots under each of the five methods and shows the extra tax each adds to the year's result (negative when the sale offsets gains), so you can see before selling which lots to sell.
- Gift planner (`donationPlan` in `calc.mjs`, `--donate BTC --price 90000 --qty 0.5 [--deduction-rate 0.3]` in the CLI): picks the lots held over a year with the most gain per coin, shows their market value, the gain that is never taxed and the long-term tax avoided against selling them. Short-term lots are skipped (a gift of those is not valued at market). Deduction limits and appraisal rules are yours to check.
- Wallet-to-wallet transfers (`matchLots` in `calc.mjs`): with per-wallet matching on, a `transfer` row with a `to wallet` column moves lots (purchase date and basis intact, chosen by the selected method) so basis follows the coins; over-transfers are warned, not guessed. Without the column, or with matching off, transfers stay ignored.
- `netCapital` / `carryoverChain` in `calc.mjs`: the $3,000 (or $1,500) annual capital-loss deduction and indefinite carryforward, chained year by year from the first sale in the file, with a table on the page and in the CLI. A loss year now lowers later years' estimated tax instead of vanishing.
- `incomeReport` / `toIncomeCsv` in `calc.mjs`: staking, mining and airdrop receipts for the report year by coin (receipts, quantity, first and last date, value when received) on the page, in the CLI and as a CSV (`--income-csv`), so the ordinary-income side of a crypto year is not buried inside the gains.
- `niit` in `calc.mjs` (`--magi`, `--other-nii`, `--filing` in the CLI; three optional boxes on the page): the 3.8% net investment income tax (Form 8960, simplified). Give your other income for the year and filing status and it charges 3.8% on the smaller of net investment income and the amount your income with the crypto result exceeds $200,000 (single or head of household), $250,000 (joint or qualifying surviving spouse) or $125,000 (separate), shows how much of it the crypto result causes, and adds a surtax column to the method comparison so a method that lowers income tax but not the surtax is visible. Staking and mining income is left to you to add as other income or other investment income, because whether it counts depends on your facts.
- Form 8949 boxes (`form8949Box`, `form8949BoxTotals` in `calc.mjs`): an optional `reported` column on sell rows (`basis` = broker reported it on Form 1099-DA with basis, `nobasis` = reported without basis, blank = not reported) sorts each row into digital-asset box G/H/I (short-term) or J/K/L (long-term), adds a Box column to the 8949 CSV and shows totals per box on the page and in the CLI. Without the column nothing changes.
- `importers.mjs` - Coinbase, Kraken, Binance.US, Binance (global spot trade history), Crypto.com App, Gemini, Bitstamp, Cash App account activity, Robinhood account activity (crypto rows only; stocks ignored), Koinly universal CSV and Coinbase Pro fills export readers that produce the plain CSV `calc.mjs` reads (unpriced rows left empty and flagged, never zero).
- Koinly universal CSV reader (`importKoinly` in `importers.mjs`): buys and sales against USD, coin-for-coin swaps split into a sale and a buy at Koinly's USD Net Worth value, labelled staking/mining/airdrop receipts as income; unlabelled transfers, non-USD fiat and non-USD fees are skipped with a note. Lets someone leaving a paid tax service re-run the five-method comparison locally.
- Map your own columns (`suggestMapping`, `applyMapping` in `importers.mjs`): for an export none of the readers recognise (a broker, a wallet app, your own sheet) the page shows a mapper. Pick which column is the date, type, asset, quantity, USD total or price and fee, say what each type value means (buy, sell, income, transfer, leave out), and it rewrites the file as the plain format on your device. Unreadable rows and missing USD values are listed, never zeroed. No exchange layout is assumed.
- `cli.mjs` - the same matching in a terminal, zero dependencies and no network: `node cli.mjs --method HIFO --year 2024 --form8949 8949.csv coinbase.csv kraken.csv` reads one or more exchange exports (or `-` for stdin), prints gains, the five-method comparison and holdings, and writes Form 8949 style rows; `--prices "BTC=65000,ETH=3200"` prints the tax-loss harvesting and wait-for-long-term views from prices you type, `--json` for scripts, `--per-wallet`, `--short-rate`/`--long-rate`, `--carry-short`/`--carry-long`/`--mfs` for loss carryforward. Exit 2 on bad usage, 1 when no transactions could be read.
- Wash-sale lookalike (`washLookalike` in `calc.mjs`, shown under the Form 8949 totals and in the CLI): crypto is outside the wash-sale rule today, but for each losing sale it finds the same coin bought or received within 30 days either side (not the lots the sale used, each purchase used once) and shows how much loss a stock-style rule would defer, so a harvesting plan survives a rule change. Informational; never applied to the tax figures.
- `usage.mjs` - local-only feature counters with an opt-out.
- `fifo-vs-hifo-crypto-cost-basis.html` - guide with a worked example that the
  test suite recomputes.

## What you use today, and what this does differently

- **A spreadsheet:** free and private, but the lot matching, holding-period split and per-method comparison are yours to build and keep correct for every sale.
- **Crypto tax services** (Koinly, CoinTracker, TokenTax and similar): they sync exchanges and wallets and file-ready reports, but they want an account, your full transaction history on their servers, and usually a paid plan for larger histories. This tool reads exports you already have and keeps them in your browser.
- **Your exchange's own tax report:** convenient, but typically one method and one platform. This tool combines several exports and shows FIFO, LIFO, HIFO, LOFO and a tax-aware rule side by side.
- **A tax professional:** the right place to settle which method you may use and how to file. This tool does not decide that.
- **What this adds:** a five-method comparison on your own CSV with estimated tax, tax-loss harvesting from prices you type, Form 8949 style rows, a zero-dependency CLI, no signup and no upload.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal, tax,
financial or investment advice. It does not fetch prices or connect to exchanges,
and does not model DeFi, NFTs, forks, lost coins, gifts, wash-sale style rules,
state tax or loss limits; the net investment income tax is a simplified estimate that runs only when you enter your other income. Which lot-identification
methods you may use depends on your jurisdiction and records. Unverified against a
real tax return: tested on hand-calculated examples and conservation checks.

**Privacy.** Everything runs in your browser; your transactions are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

## Host your own copy

Your data stays in your browser either way, but you can serve the page from an address you control. It is a static
site: the server only hands out files and never sees a figure or a file you load.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
