# Prop Firm Challenge Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/prop-firm-challenge-calculator/>

**Will your strategy pass a funded-trader challenge, and is the fee worth paying?** Enter the rules (profit target, daily loss limit, static or trailing max drawdown, time limit, minimum trading days), your win rate, average reward:risk, risk per trade and trades per day, and the fee and profit split. The simulator plays the evaluation thousands of times and reports pass probability, how failed attempts ended (drawdown, daily limit, time), expected attempts and fees to pass, a funded-phase payout estimate, the break-even win rate, and a table of pass rate by risk per trade.

Open `index.html` in a browser. It needs no account, network request or API key. Same seed gives the same answer. Export the risk table as CSV, copy a summary, or copy a shareable link (the inputs live in the link itself).

## Model and limits

Each trade risks a fixed share of the starting balance and wins with your win rate for reward:risk times that risk; trades are independent. The daily limit is checked after every trade; the drawdown floor is static or follows the high-water mark (optionally stopping at the starting balance). The funded phase pays your split each time the account gains the payout target and ends on a breach. Streaks, slippage, commissions, news rules, consistency rules and scaling plans are not modelled, and it knows no firm's exact rules. It is a simulation of assumed inputs, not a forecast.

Unit tests check the engine against all-win and all-loss hand counts and against the gambler's-ruin closed form (P = b/(a+b) for a fair walk).

## Privacy and usage

Everything runs in your browser. Nothing is uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage (`sim_run`, `csv_exported`, `summary_copied`, `share_link_copied`). Do Not Track and Global Privacy Control disable counting.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or financial advice, and it does not replace a qualified professional. Trading carries a risk of loss. **You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use. Not affiliated with any trading firm.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Development

`calc.mjs` is a pure ES module. Run tests with `node --test`.
