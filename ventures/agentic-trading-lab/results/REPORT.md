# Agentic Trading Lab: study results

Generated 2026-10-28T02:35:30Z by `python -m tradelab study`. Every number below is in `study.json` beside this file. Backtests are hypothetical: no money was traded, the industry portfolios are not directly investable, and past performance does not predict future results.

## US equities: 10 industry portfolios

Data: Ken French Data Library, 10 industry portfolios (value-weighted), CRSP, 192607 to 202609, monthly. Costs 10 bps per unit of turnover.

### Every default rule, whole sample (after a 36-month warm-up)

| Rule | CAGR | Vol | Sharpe | Max DD | Turnover/yr |
|---|---:|---:|---:|---:|---:|
| `equal_weight()` | 10.3% | 17.9% | 0.46 | -81.9% | 0.3 |
| `inverse_vol(vol_window=12)` | 10.2% | 17.0% | 0.47 | -80.7% | 0.7 |
| `sma_trend(lookback=10)` | 9.4% | 10.7% | 0.60 | -51.0% | 1.8 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 10.1% | 11.8% | 0.60 | -33.0% | 2.6 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 12.1% | 18.3% | 0.54 | -74.2% | 5.1 |
| `dual_momentum(lookback=12,top_k=3)` | 12.8% | 15.4% | 0.65 | -41.5% | 4.2 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 11.2% | 12.5% | 0.65 | -44.4% | 2.9 |
| `reversal(bottom_k=3,lookback=1)` | 4.7% | 19.5% | 0.17 | -87.2% | 15.8 |
| `dual_momentum(lookback=12,top_k=3)|vt=0.1,L=1.0` | 10.2% | 11.7% | 0.61 | -46.0% | 3.5 |
| `US market (buy and hold)` | 9.8% | 18.4% | 0.42 | -83.7% | 0.0 |

### Agent search: 98 trials on data up to 1999 (846 scored months after warm-up), judged once on 2000 onward

- In-sample winner: `dual_momentum(lookback=12,top_k=2)`, Sharpe 0.69.
- Deflated Sharpe Ratio 0.999 (gate >= 0.95): pass.
- Probability of backtest overfitting 0.50 over 252 CSCV splits (gate <= 0.5): fail.
- Holdout: Sharpe 0.50, CAGR 9.8%, max drawdown -27.9%. Equal weight over the same months: Sharpe 0.53, CAGR 9.1%, max drawdown -48.1%.
- Alpha against equal weight on the holdout: 2.5%/yr, Newey-West t = 0.98, beta 0.82.
- Holdout Sharpe 95% interval (stationary bootstrap): winner [0.15, 0.89], equal weight [0.15, 0.97].
- **Promotable to paper trading: no.**

### Holdout Sharpe by cost (bps per unit turnover)

| Rule | 0 | 10 | 25 | 50 |
|---|---:|---:|---:|---:|
| `equal_weight()` | 0.54 | 0.53 | 0.53 | 0.53 |
| `inverse_vol(vol_window=12)` | 0.56 | 0.55 | 0.54 | 0.53 |
| `sma_trend(lookback=10)` | 0.72 | 0.70 | 0.67 | 0.61 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 0.57 | 0.55 | 0.51 | 0.45 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 0.59 | 0.56 | 0.51 | 0.42 |
| `dual_momentum(lookback=12,top_k=3)` | 0.62 | 0.58 | 0.54 | 0.45 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 0.69 | 0.66 | 0.62 | 0.54 |
| `reversal(bottom_k=3,lookback=1)` | 0.40 | 0.31 | 0.17 | -0.05 |
| `dual_momentum(lookback=12,top_k=3)|vt=0.1,L=1.0` | 0.56 | 0.52 | 0.47 | 0.37 |

### Walk-forward selection

Every 12 months from 193907, pick the best of 49 rules by trailing (expanding-window) Sharpe and trade it for a year. 19 switches.

- Walk-forward: CAGR 11.0%, Sharpe 0.62, max drawdown -29.9%.
- Equal weight, same months: CAGR 11.9%, Sharpe 0.62, max drawdown -48.1%.
- Most often chosen: `tsmom(asset_vol_target=0.2,lookback=9)` (34 yrs), `dual_momentum(lookback=12,top_k=2)` (24 yrs), `tsmom(asset_vol_target=0.2,lookback=12)` (18 yrs), `dual_momentum(lookback=12,top_k=5)` (12 yrs).

### Before and after publication

| Rule | Published | Sharpe before | Sharpe after | Edge over 1/N before | Edge after |
|---|---:|---:|---:|---:|---:|
| `sma_trend(lookback=10)` | 2007 | 0.57 | 0.73 | +0.15 | +0.10 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 2012 | 0.59 | 0.70 | +0.17 | -0.11 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 1999 | 0.54 | 0.56 | +0.10 | +0.02 |
| `dual_momentum(lookback=12,top_k=3)` | 2014 | 0.65 | 0.64 | +0.22 | -0.04 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 2014 | 0.66 | 0.64 | +0.22 | -0.04 |
| `reversal(bottom_k=3,lookback=1)` | 1990 | 0.06 | 0.39 | -0.32 | -0.28 |

## US equities: 49 industry portfolios

Data: Ken French Data Library, 49 industry portfolios (value-weighted), CRSP, 196907 to 202609, monthly. Costs 10 bps per unit of turnover.

### Every default rule, whole sample (after a 36-month warm-up)

| Rule | CAGR | Vol | Sharpe | Max DD | Turnover/yr |
|---|---:|---:|---:|---:|---:|
| `equal_weight()` | 11.4% | 17.0% | 0.47 | -52.7% | 0.4 |
| `inverse_vol(vol_window=12)` | 11.3% | 16.2% | 0.48 | -51.0% | 0.8 |
| `sma_trend(lookback=10)` | 9.7% | 10.6% | 0.52 | -26.9% | 2.0 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 11.1% | 13.0% | 0.54 | -29.0% | 2.9 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 17.2% | 23.5% | 0.61 | -65.4% | 7.8 |
| `dual_momentum(lookback=12,top_k=3)` | 16.3% | 22.5% | 0.60 | -46.7% | 7.3 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 13.3% | 15.4% | 0.61 | -28.4% | 4.7 |
| `reversal(bottom_k=3,lookback=1)` | 2.8% | 24.0% | 0.06 | -73.7% | 21.3 |
| `dual_momentum(lookback=12,top_k=3)|vt=0.1,L=1.0` | 11.7% | 11.8% | 0.63 | -19.1% | 4.4 |
| `US market (buy and hold)` | 11.2% | 15.8% | 0.48 | -50.3% | 0.0 |

### Agent search: 98 trials on data up to 1999 (330 scored months after warm-up), judged once on 2000 onward

- In-sample winner: `xs_momentum(lookback=12,skip=0,top_k=5)|vt=0.1,L=1.0`, Sharpe 0.71.
- Deflated Sharpe Ratio 0.890 (gate >= 0.95): fail.
- Probability of backtest overfitting 0.19 over 252 CSCV splits (gate <= 0.5): pass.
- Holdout: Sharpe 0.62, CAGR 9.5%, max drawdown -21.8%. Equal weight over the same months: Sharpe 0.55, CAGR 10.1%, max drawdown -52.7%.
- Alpha against equal weight on the holdout: 3.5%/yr, Newey-West t = 2.09, beta 0.50.
- Holdout Sharpe 95% interval (stationary bootstrap): winner [0.35, 0.92], equal weight [0.19, 0.95].
- **Promotable to paper trading: no.**

### Holdout Sharpe by cost (bps per unit turnover)

| Rule | 0 | 10 | 25 | 50 |
|---|---:|---:|---:|---:|
| `equal_weight()` | 0.55 | 0.55 | 0.54 | 0.54 |
| `inverse_vol(vol_window=12)` | 0.56 | 0.55 | 0.54 | 0.53 |
| `sma_trend(lookback=10)` | 0.74 | 0.72 | 0.68 | 0.63 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 0.62 | 0.60 | 0.56 | 0.50 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 0.65 | 0.62 | 0.57 | 0.50 |
| `dual_momentum(lookback=12,top_k=3)` | 0.65 | 0.62 | 0.57 | 0.50 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 0.73 | 0.70 | 0.65 | 0.58 |
| `reversal(bottom_k=3,lookback=1)` | 0.24 | 0.16 | 0.03 | -0.18 |
| `dual_momentum(lookback=12,top_k=3)|vt=0.1,L=1.0` | 0.63 | 0.60 | 0.56 | 0.48 |

### Walk-forward selection

Every 12 months from 198207, pick the best of 49 rules by trailing (expanding-window) Sharpe and trade it for a year. 9 switches.

- Walk-forward: CAGR 15.0%, Sharpe 0.62, max drawdown -53.9%.
- Equal weight, same months: CAGR 12.5%, Sharpe 0.59, max drawdown -52.7%.
- Most often chosen: `xs_momentum(lookback=12,skip=0,top_k=5)` (31 yrs), `xs_momentum(lookback=9,skip=0,top_k=5)` (8 yrs), `xs_momentum(lookback=12,skip=1,top_k=2)` (2 yrs), `xs_momentum(lookback=9,skip=1,top_k=2)` (2 yrs), `dual_momentum(lookback=9,top_k=3)` (1 yrs).

### Before and after publication

| Rule | Published | Sharpe before | Sharpe after | Edge over 1/N before | Edge after |
|---|---:|---:|---:|---:|---:|
| `sma_trend(lookback=10)` | 2007 | 0.44 | 0.71 | +0.02 | +0.15 |
| `tsmom(asset_vol_target=0.4,lookback=12)` | 2012 | 0.49 | 0.73 | +0.09 | -0.00 |
| `xs_momentum(lookback=12,skip=1,top_k=3)` | 1999 | 0.60 | 0.62 | +0.21 | +0.07 |
| `dual_momentum(lookback=12,top_k=3)` | 2014 | 0.58 | 0.63 | +0.15 | +0.02 |
| `trend_momentum_blend(lookback=12,sma_lookback=10,top_k=3)` | 2014 | 0.60 | 0.67 | +0.17 | +0.05 |
| `reversal(bottom_k=3,lookback=1)` | 1990 | -0.08 | 0.13 | -0.32 | -0.49 |

## Crypto: BTC-USD and ETH-USD, daily

Data: Coinbase Exchange public daily candles (close to close, UTC days), 2016-05-19 to 2026-10-27. Costs 50 bps per unit of turnover (Robinhood charges crypto through a spread; it varies). Cash earns zero here.

- 22 trials on 2016-2021; winner `sma_trend(lookback=20)`, in-sample Sharpe 2.07.
- DSR 1.000, PBO 0.81.
- Holdout (2022 on): Sharpe -0.08, CAGR -8.9%, max drawdown -50.5%; 50/50 rebalanced: Sharpe 0.31, CAGR 1.5%, max drawdown -68.8%.
- Winner holdout Sharpe 95% interval: [-1.03, 0.88].
- **Promotable: no.**

| Rule | 0 | 25 | 50 | 100 | 150 |
|---|---:|---:|---:|---:|---:|
| `sma_trend(lookback=20)` | 0.48 | 0.20 | -0.08 | -0.63 | -1.18 |
| `equal_weight()` | 0.34 | 0.32 | 0.31 | 0.29 | 0.27 |
| `sma_trend(lookback=200)` | 0.81 | 0.75 | 0.70 | 0.58 | 0.47 |
