# Price Elasticity Estimator

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
