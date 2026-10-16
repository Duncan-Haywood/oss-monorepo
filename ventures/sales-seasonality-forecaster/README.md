# Sales Seasonality Forecaster

A free browser tool for shops, restaurants, cafes and any seasonal business:
**paste or upload a CSV of date and sales and get a forecast for the next 6 to 12 months, with the slow months and
the cash cushion to get through them.** It fits Holt-Winters exponential smoothing to your own history, shows 80%
and 95% ranges, tells you which months are peak and slow, and back-tests itself against "same month last year" so you
can see whether to trust it at all. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sales-seasonality-forecaster/

After using this, you can now **see how much cash the slow season will cost you before it arrives, and know whether the
forecast is any better than just repeating last year**.

## Model

- Input: rows of date and amount (daily, weekly or monthly). Rows are summed into calendar months; refunds (negative
  amounts) net against sales; months with no rows are filled with zero and a warning says so; a half-covered first or
  last month of daily data is dropped. At least 24 months are required.
- Holt-Winters with a 12-month season: additive or multiplicative seasonality, undamped or damped trend. The smoothing
  parameters are found by Nelder-Mead (four starts) minimising one-step-ahead squared error. The four combinations are
  scored on a hold-out (the last 12 months, or 6 if there are under 36) by MASE and the best is refitted on everything.
- Prediction intervals: in-sample one-step residual spread, widened with the horizon by the Hyndman et al. (2008)
  variance recursion, with a small-sample allowance `1 + 16/(n-12)` calibrated on simulated series so that 80% bands
  cover about 80%. Multiplicative models use relative errors.
- Back-test: rolling origin, up to 12 starting points, 6 months ahead each, refitting at every origin, against the
  baseline "same month last year". Reports MASE and MAPE for both, and says "do not trust" when the model does not beat
  the baseline. The model type was chosen on data that overlaps the back-test, so the back-test flatters the model
  slightly.
- Slow-season cash cushion: for each forecast month, the amount by which the low band (80% or 95%) falls short of your
  monthly fixed cost; the cushion is the sum, plus the largest running deficit.

Not modelled: promotions, price changes, holidays that move (Easter, Lunar New Year), trading-day effects, a one-off
shock inside the history, or anything about cash timing (it forecasts the figures you give it, not bank balances).
Unverified against a published dataset: tests use simulated series with known answers.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.
