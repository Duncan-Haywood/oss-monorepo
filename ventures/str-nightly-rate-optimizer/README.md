# STR Nightly Rate Optimizer

A free browser tool for short-term rental hosts: **paste or upload a CSV of listed nights (the nightly price you
listed and whether it booked), say what the platform fee and each turnover cost you, and get a booking-chance
curve, the nightly price with the highest expected profit per listed night inside the range you have actually
listed, and a back-test that says whether price explains which nights booked at all.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/str-nightly-rate-optimizer/

After using this, you can now **see how much each extra 5% on your nightly price costs you in bookings and which
price earns the most**, which used to take a guess or a paid dynamic-pricing subscription.

## Model

- Input: rows of `[date,] price, booked` (a header may reorder the columns by name; the date is ignored). Booked is
  1/0, booked/empty, reserved/available, yes/no and similar; unreadable rows and blocked nights are skipped with a
  warning.
- `P(booked) = 1 / (1 + exp(-(a + b·x)))` with `x = ln(price)`. Newton-Raphson with step halving and a tiny ridge
  (perfect separation stays finite and is flagged). 95% interval on the slope from the inverse Hessian.
- Profit of a booked night: `price·(1 − fee) − turnover ÷ average stay − cost per guest night`; an empty night earns
  nothing. Expected profit per listed night is `P(booked)` times that.
- Best price: searched on a grid between the lowest and highest price seen, never outside. 300 seeded bootstrap
  resamples (booked and empty nights resampled separately) give the 80% range of the best price and of the gain,
  and the share of resamples in which it beats the usual price.
- Refuses: fewer than 40 nights, fewer than 8 booked or 8 empty, prices that barely varied (sd of `ln(price)` under
  2%), or fewer than 4 distinct price levels.
- Flags: a non-negative slope (prices were raised on nights already in demand), perfect separation, a best price at
  the edge of the tested range, a usual price outside the tested range, and costs that leave no margin.
- Back-test: fit on the first 75% in the order given, score the last 25% by log-loss against overall occupancy.

## Limits

Correlation, not an experiment. Seasonality, day of week, events, lead time, minimum stays, reviews, competitors,
taxes and guest-paid cleaning fees are not modelled. Verified only against simulated nights with known curves.
Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
