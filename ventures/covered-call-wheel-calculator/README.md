# Covered Call & Wheel Calculator

A free browser tool for options income sellers: **paste option quotes for one stock and see every strike
ranked by annualized premium yield, model chance of assignment, breakeven and payoff at expiry**, for covered
calls (you own the shares) or cash-secured puts (you want to). It picks the highest-paying quote that stays
under the assignment chance you set. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/covered-call-wheel-calculator/

After using this, you can **choose a strike by yield against the risk of losing the shares** instead of by
eye, and see what the premium costs you in capped upside.

## Model

- Quote line: strike, premium per share, days to expiry, optional implied volatility %. A contract is 100
  shares; commission is charged once per contract and taken out of the premium.
- Covered call: yield = premium / stock price; return if called away = (strike - price + premium) / price;
  breakeven = price - premium. Cash-secured put: yield = premium / strike; breakeven (effective purchase
  price) = strike - premium.
- Annualized = yield x 365 / days (simple). Chance of assignment = Black-Scholes N(d2) for calls, N(-d2) for
  puts, from the row's implied volatility or the default. It is a model estimate, not a forecast.
- Income pick = max annualized yield with assignment chance within your limit. Target pick = best
  if-called return among strikes at or above your sell price (calls), or best yield among puts whose
  effective cost is at or below your buy price.
- Payoff table: expiry P&L for the income pick at -20% to +20% moves, next to holding (or buying) the stock.

Not modelled: dividends, early exercise, volatility change, taxes, margin, spreads, multiple underlyings.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, does not recommend any security or option, and does not
replace a qualified professional. Options involve risk. **You are responsible for reviewing and verifying its
output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

Independent of brokers and exchanges.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
