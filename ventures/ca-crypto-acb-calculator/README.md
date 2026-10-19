# Canada Crypto ACB Calculator

Free, browser-only tool for Canadian holders of Bitcoin, Ether and other
cryptocurrency. Paste or open a CSV of your buys, sales, swaps and staking income
and it works out the **average adjusted cost base (ACB)** of each coin, applies
the CRA's **superficial loss rule** to every loss, and shows each calendar year's
taxable capital gain. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ca-crypto-acb-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - CSV parsing with header aliases (year-first dates only, so a
  day/month swap can never move a sale across a window), average-cost ACB per
  coin across all wallets, fees, swaps, income at value received, the
  superficial loss rule (the smallest of units sold, units bought in the 61-day
  window and units held after day 30; the denied share of the loss is added to
  ACB, or carried to the next purchase), the taxable share of the net gain,
  net capital losses carried between years, an optional tax estimate at a
  marginal rate you type, year-end ACB balances, and CSV export of the working.
- `cli.mjs` - the same engine in a terminal:
  `node cli.mjs --year 2024 --marginal-rate 0.43 --dispositions-csv working.csv history.csv`.
  Exit 2 on bad usage, 1 when no row could be read.
- `superficial-loss-rule-crypto-canada-worked-example.html` - guide whose numbers
  the test suite recomputes.

## Scope

Covered: buys, sells, swaps between coins, staking and airdrop receipts entered
at their dollar value, fees, losses between years, the 50% inclusion rate (an
input; the proposed two-thirds rate was cancelled in March 2025).
Not covered: purchases by an affiliated person (a spouse, or your own RRSP or
TFSA) that also trigger the superficial loss rule, trading as a business,
DeFi, NFTs, forks, loss carrybacks, alternative minimum tax. Prices are yours;
none are fetched. Rows on one day run in file order.

## What you use today, and what this does differently

- **A spreadsheet:** free and private, but the superficial loss window (30 days
  either side, and held at the end of day 30) and the partial-denial maths are
  easy to get wrong, and most templates use FIFO, which is not the CRA's method.
- **Crypto tax services** (Koinly, CoinTracker, Awaken, Cryptio and similar):
  they sync exchanges and wallets and produce files for your return, but they
  want an account, your history on their servers, and a fee that rises with
  transaction count.
- **An accountant:** the right place to settle borderline treatment (business
  income, affiliated purchases). This tool gives the working to hand them.
- **What this adds:** the CRA's average-cost method and the superficial loss rule
  on your own CSV, the denied loss shown against every sale, a zero-dependency
  CLI, no signup, no upload.

## Host your own copy

It is a static site; the server only hands out files and never sees a figure or a
file you load. `docker compose up -d` (nginx, <http://localhost:8080>), or deploy
`fly.toml` / `render.yaml` from your fork. Nothing runs on the author's accounts.
Tests: `node --test deploy.test.mjs`. The Docker image has not been built in the
session that added these files; build it once and open the page before relying on it.

No warranty. Not tax advice. MIT licence, see `LICENSE`.
