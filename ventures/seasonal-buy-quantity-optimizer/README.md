# Seasonal Buy Quantity Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/seasonal-buy-quantity-optimizer/>

A free browser tool for anyone who buys stock once per season and cannot reorder: **enter past seasons (sold-out
seasons handled) or a low / likely / high guess, plus price, cost, supplier price breaks and leftover value, and get the
order quantity that maximises expected profit, a cautious order, the chance of selling out or losing money, and a
back-test on your own history.** Nothing is uploaded.

After using this, you can now **decide how many units to order for a holiday, a drop or an event, see what a supplier
price break is really worth, and know how much cash you are risking**.

## Model

- Demand: `ln(demand)` normal. From past seasons, fitted by EM with sold-out seasons as right-censored; with few
  seasons the spread is uncertain, so demand is drawn from the Bayesian predictive (truncated at 3.5 sd). From a
  guess, the 10th/50th/90th percentiles set the median and spread, widened by a factor (default 1.3).
- 4,000 stratified, seeded draws. Profit for order `q`: `price·min(q,D) + (leftover value − holding)·leftover −
  lost-sale cost·shortfall − tier cost(q)·q − fixed cost`. Every quantity (including each price-break quantity and the
  one below it) is scored on the same draws.
- Best order = highest average profit. Cautious order = highest average of the worst 10% of outcomes (CVaR).
  Textbook newsvendor quantile shown as a reference. Value of knowing demand is an upper bound.
- Back-test: leave-one-season-out against "order the average" and "order the best ever".
- Refuses: fewer than 3 seasons, fewer than 2 that did not sell out, leftover value above price, bad ranges.

## Limits

No trends, competitors, price or ad effects, partial reorders or in-season markdowns. Verified against the closed-form
newsvendor answer and simulated data only. Statistical estimate from your numbers, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
