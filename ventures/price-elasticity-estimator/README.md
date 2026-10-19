# Price Elasticity Estimator

A free browser tool for sellers of any product: **paste or upload a CSV of date, price and units sold and get your
price elasticity with a confidence interval, the profit-maximising price inside the prices you have actually charged,
and a back-test that says whether price explains your sales at all.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/price-elasticity-estimator/

After using this, you can now **tell whether raising or lowering your price would have earned more, how sure that is,
and whether your data can answer the question at all**.

## Model

- Input: rows of `date,price,units` (or `price,units` in time order). Rows on one date are combined (units added,
  price averaged by units). Zero-unit rows are dropped with a warning.
- `ln(units) = a + e·ln(price)`, plus an optional linear trend and an annual sine/cosine pair. OLS with HC1 robust
  standard errors; 95% interval from Student's t.
- 400 pairs-bootstrap resamples (seeded, reproducible) give the 80% interval of the elasticity, of the best price and
  of the profit gain, and the share of resamples in which the best price beats the current one.
- Best price: grid search between the lowest and highest price seen, never outside. When demand is elastic, the
  textbook `cost·e/(e−1)` is shown as a reference. A best price on the edge of the range is flagged.
- Refuses: fewer than 12 rows, fewer than 3 price levels, or a price that barely moved (sd of ln price under 3%).
- Flags: a non-negative slope (price raised in busy periods), price and time moving in a line, zero-unit rows.
- Back-test: fit on the first 75%, predict the last 25%, compare with the same model without price.
- Return visits: the last elasticity and row count are kept in this browser only (localStorage, never sent) so a re-run after a price change shows the shift.

## Limits

Correlation, not an experiment. Promotions, competitors, stock-outs and cross-product effects are not modelled.
Verified only against simulated data with known elasticities. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
