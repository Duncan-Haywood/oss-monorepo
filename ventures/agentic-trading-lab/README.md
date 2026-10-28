# Agentic Trading Lab

**A research agent for rules-based trading that keeps score honestly, then lets you paper trade (and, behind
several locks, live trade) your own account.** It backtests eight published momentum, trend and risk rules on US
industry portfolios from 1926 and on BTC/ETH since 2016. It charges for every configuration it tries (Deflated
Sharpe Ratio, Probability of Backtest Overfitting) and judges the winner once on data it never saw. Only strategies
that clear that gate are offered for trading. Brokers: a local paper account, Alpaca (stocks/ETFs, paper or live)
and Robinhood's official Crypto Trading API.

**Page:** https://duncan-haywood.github.io/oss-monorepo/agentic-trading-lab/ ·
**Full results:** [`results/REPORT.md`](results/REPORT.md) · **Why not a fund:** [`LEGAL.md`](LEGAL.md)

> **No warranty.** This software is provided free and as-is, without warranty of any kind, express or implied. It
> is not investment, financial, legal or tax advice, and it does not replace a qualified professional. Backtests are
> hypothetical, use data that is not directly investable, and do not predict future results. Trading can lose money,
> including everything in the account. **You are responsible for reviewing and verifying its output before relying
> on it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising
> from its use. It is for a person trading their own account, not for managing anyone else's money.

## What the first study found

Rerun with `tradelab study` (data through September 2026 for equities, 27 October 2026 for crypto). Equities: tuned on
data to 1999, judged on January 2000 to September 2026, 10 bps per unit of turnover. Crypto: tuned on 2016-2021,
judged on 2022 onward, 50 bps.

| Universe | Agent's pick (in-sample) | Holdout Sharpe, pick vs equal weight | Holdout max drawdown | DSR | PBO | Promoted |
|---|---|---:|---:|---:|---:|---|
| 10 US industries | dual momentum 12m, top 2 | 0.50 vs 0.53 | −27.9% vs −48.1% | 0.999 | 0.50 | no (PBO) |
| 49 US industries | cross-sectional momentum 12m, top 5, 10% vol target | 0.62 vs 0.55 | −21.8% vs −52.7% | 0.890 | 0.19 | no (DSR) |
| BTC + ETH, daily | 20-day moving average | −0.08 vs 0.31 | −50.5% vs −68.8% | 1.000 | 0.81 | no (PBO, holdout) |

What that says, plainly:

- **No rule the agent picked beat equal weight convincingly out of sample.** The best case, 49 industries, has
  alpha of 3.5%/yr against equal weight (Newey-West t = 2.09). But that winner was the best of 98 tries, and the
  Deflated Sharpe Ratio says that is not enough to rule out luck.
- **Trend rules cut drawdowns roughly in half, consistently.** Whole-sample 10-month SMA: −51% vs −82% (10
  industries), −27% vs −53% (49 industries). That is the most robust thing in the study, and it is a risk result,
  not a return result.
- **The crypto in-sample winner was the classic overfit.** Sharpe 2.07 in 2016-2021, −0.08 after. PBO caught it
  (0.81). DSR did not (1.000), because DSR only charges for the number of trials and a raw Sharpe of 2 clears that
  easily. It is why the gate needs both. The slow 200-day rule held a 0.70 Sharpe at 50 bps.
- **Costs decide fast rules.** One-month reversal goes from 0.40 to −0.05 holdout Sharpe between 0 and 50 bps; the
  20-day crypto rule from 0.48 to −0.08 at 50 bps.
- **Walk-forward re-selection** (re-pick the best trailing-Sharpe rule every year): Sharpe 0.62 vs 0.62 for equal
  weight from 1939 (10 industries), 0.62 vs 0.59 from 1982 (49 industries).
- **Before and after publication** (McLean and Pontiff 2016): against equal weight, the edge of time-series and dual
  momentum turned slightly negative after their publication years on 10 industries, while the 10-month SMA's edge
  survived. Post-publication samples are short (12 to 19 years), so read this as a direction, not a test.

## How it works

```
propose (grid, or Claude with your key) ──► backtest in-sample ──► log trial
            ▲                                                         │
            └──────────────── until budget ◄──────────────────────────┘
pick best in-sample ──► DSR over all trials + PBO (CSCV) ──► holdout, once ──► gate ──► paper ──► live (locked)
```

- `data.py`: Ken French Data Library industry portfolios and RF (CRSP-based, monthly from July 1926), Coinbase daily
  candles. Downloaded to `.cache/` on first use, never committed (the files are theirs to distribute).
- `strategies.py`: equal weight; 10-month SMA trend (Faber 2007); time-series momentum with per-asset vol sizing
  (Moskowitz, Ooi and Pedersen 2012); cross-sectional momentum (Jegadeesh and Titman 1993; industries: Moskowitz
  and Grinblatt 1999); dual momentum (Antonacci 2014); inverse volatility (cf. Maillard, Roncalli and Teiletche
  2010); short-term reversal (Jegadeesh 1990; Lehmann 1990); a trend/momentum blend. A bounded `SEARCH_SPACE` of 49
  configurations, times two for the vol-target overlay.
- `backtest.py`: event loop where a strategy only ever sees periods before the one it trades (a test perturbs the
  future and checks past weights do not move). Weights drift between rebalances; costs are charged on actual
  turnover; borrowing pays RF + 1%. Volatility-target overlay (Moreira and Muir 2017). Walk-forward selection with
  switching costs.
- `stats.py`: Sharpe, Sortino, drawdown, Calmar; Probabilistic and Deflated Sharpe Ratio (Bailey and López de Prado
  2012, 2014); PBO by combinatorially symmetric cross-validation (Bailey, Borwein, López de Prado and Zhu 2017);
  stationary-bootstrap Sharpe intervals (Politis and Romano 1994); alpha/beta with Newey-West errors. Written from
  the papers' formulas.
- `agent.py`: the propose → backtest → score loop and the gate (DSR ≥ 0.95, PBO ≤ 0.5, holdout Sharpe > 0 with PSR ≥
  0.90). The optional Claude proposer only reorders the search: proposals outside the space are rejected, so it
  cannot add hidden trials.
- `execution/`: order planning (sells first, skip trades under 1% of equity), the guard, and brokers.

## Use it

```
pip install -e .                       # numpy; `pip install -e .[robinhood]` adds Ed25519 signing
tradelab study                         # rerun everything above (downloads data; a few minutes)
tradelab backtest --universe ind49 --strategy xs_momentum --param lookback=12 --param top_k=5 --cost 25
tradelab backtest --universe crypto:BTC-USD,ETH-USD --strategy sma_trend --param lookback=200 --cost 50
tradelab research --universe ind10 --budget 200 --out report.json
tradelab research --proposer claude --out report.json      # needs your ANTHROPIC_API_KEY
tradelab signal --report report.json                         # target weights now, mapped to sector ETFs
tradelab rebalance --report report.json                      # dry run: prints orders, sends nothing
tradelab rebalance --report report.json --execute            # local paper account (paper-state.json)
tradelab rebalance --broker alpaca --report report.json --execute    # Alpaca paper, APCA_API_KEY_ID/SECRET
```

Without installing: `PYTHONPATH=src python3 -m tradelab ...`. Tests: `PYTHONPATH=src python3 -m unittest discover -s
tests` (offline) and `node --test usage.test.mjs page.test.mjs`.

### Live trading is locked behind five things

1. `--live` on the command line;
2. `TRADELAB_LIVE_CONFIRM="I accept that live trading can lose money"` in the environment;
3. no kill-switch file (`.tradelab-kill`, or `$TRADELAB_KILL_FILE`): `touch .tradelab-kill` stops everything;
4. a research report whose gate passed (`--allow-unpromoted` overrides, on purpose loudly);
5. per-order notional, orders-per-run, per-symbol weight and gross-exposure limits. Orders that break them are
   refused and listed, never resized.

Robinhood's Crypto Trading API has no paper mode, so `--broker robinhood-crypto --execute` always needs `--live`.
Keys come from your environment only (`ROBINHOOD_API_KEY`, `ROBINHOOD_PRIVATE_KEY_B64`; `APCA_API_KEY_ID`,
`APCA_API_SECRET_KEY`) and go only to that broker. **The Alpaca and Robinhood adapters follow the providers'
published API docs and are tested against recorded request shapes and signatures with a fake transport. They have
not been run against a live account from this repository.** Start with paper.

### From research assets to tickers

The equity study trades Fama-French industry portfolios, which you cannot buy. `signal`/`rebalance` map the ten
industries to sector ETFs (`NoDur→XLP, Durbl→XLY, Manuf→XLI, Enrgy→XLE, HiTec→XLK, Telcm→XLC, Shops→XRT, Hlth→XLV,
Utils→XLU, Other→XLF`). The match is loose (different weighting and membership; XLC dates from 2018), so live results
will only roughly track the backtest. 49-industry signals have no ETF mapping; use them for research.

## Not modelled

Taxes; bid-ask spreads beyond the flat cost; market impact; ETF tracking error and expense ratios; dividends' timing
(the French returns include them); cash yield in crypto (set to zero); intraday stops; corporate events; survivorship
in crypto (only two coins, both survivors); the gap between month-end signals and the next trade's fill price.

## Alternatives

General backtesting libraries (event-driven simulators, vectorised research frameworks) do far more simulation;
broker-side "auto-invest" features do far less research. This sits between: a small, readable engine whose job is
to stop you from trading a lucky backtest, plus the plumbing to act on what survives. Not affiliated with, or
endorsed by, Robinhood, Alpaca, Coinbase, Anthropic or the Kenneth R. French Data Library.

## Privacy

Everything runs on your machine. Market data is downloaded from the sources above; broker requests go only to your
broker; with `--proposer claude`, trial summaries (configurations and Sharpe ratios, no account data) go to
Anthropic's API under your key. The web page loads only its own `results/study.json` and keeps anonymous event counts
in your browser's storage, with a switch to turn them off.

MIT licence. Built with AI assistance. [Support the work](https://github.com/sponsors/Duncan-Haywood) (optional).
