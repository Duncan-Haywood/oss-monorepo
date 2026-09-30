# Price Elasticity Estimator

<<<<<<< HEAD
A free browser tool for sellers: **paste or upload your own price and units history and see how demand responds to
price, whether your data can tell at all, and which price earns the most profit inside the range you have tested.** It
fits a log-log regression, reports the elasticity with a 95% confidence interval and R squared, controls for a time
trend, promotions and seasons, and back-tests itself on rows it held out. Nothing is uploaded.

After using this, you can now **see whether raising or lowering your price is likely to pay, how sure the data are, and
whether your history varied enough to say anything**.

## Model

- Input: rows of date, price, units, and optionally unit cost and a promo flag (1/0, yes/no), in that order or under
  any of the usual header names. Rows with a zero or negative price or zero units are skipped with a note. At least 12
  rows and two distinct prices.
- Regression: `ln(units) = a + e * ln(price) + controls + noise` by ordinary least squares. `e` is the elasticity. The
  interval uses the t distribution with n minus terms degrees of freedom. Controls: a straight-line time trend (per
  year), the promo flag when it varies, and month-of-year dummies when switched on and there is about a year of rows.
  If the design is singular the tool drops seasonality, then promo, then trend, and says so.
- Identification: "cannot identify" when the price range is under 5% or the log-price spread under 2%, or when the
  controls explain nearly all of price (variance inflation above 10); "weak" for a range under 15%, fewer than three
  price levels, variance inflation above 5 or an interval more than two points wide. The profit-maximising price is
  withheld when price cannot be identified. Price and time correlated above 0.8 is reported separately.
- Profit-maximising price: for constant elasticity `e < -1`, `p* = cost * e / (1 + e)`. Computed at the point estimate
  and at both ends of the 95% interval, each capped to the lowest and highest price in the history. For `e >= -1`
  profit rises with price, so the answer is the top of the tested range. A positive estimate gets no recommendation.
- What-if table: units scaled from the mean of the last 8 rows as `units * (p / p_ref) ^ e`, with a range from the ends
  of the interval, revenue, profit and profit change when a unit cost is known. Rows outside the tested prices are
  marked as extrapolation.
- Back-test: the last N rows (default about 20%, 3 to 12) are held out, the model is fitted on the rest, and predicted
  units are compared with the same model without price and with the training average (average percentage miss).
  Worse than the no-price model means "do not trust". Predictions use a smearing correction for the log transform.

Not modelled: competitor prices, stock-outs, ad spend, anticipation and stockpiling, non-constant elasticity,
customer segments, cross-product effects, and cause (history shows association; a price experiment is stronger).
Unverified against a published dataset: tests use simulated series with known elasticities, including a 200-series
interval coverage check, a drifting-trend confounder and a seasonal confounder.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.
=======
A free browser tool for sellers of any product: **paste or upload a CSV of date, price and units sold and get your
price elasticity with a confidence interval, the profit-maximising price inside the prices you have actually charged,
and a back-test that says whether price explains your sales at all.** Nothing is uploaded.

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

## Limits

Correlation, not an experiment. Promotions, competitors, stock-outs and cross-product effects are not modelled.
Verified only against simulated data with known elasticities. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
>>>>>>> origin/main
