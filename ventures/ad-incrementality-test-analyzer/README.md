# Ad Incrementality Test Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ad-incrementality-test-analyzer/>

A free browser tool for anyone who runs ads: **paste sales by store or region, name the test regions and the campaign
start date, and get the incremental lift with an interval, incremental ROAS, profit after ad spend, and the smallest
lift the test could have detected.** Nothing is uploaded.

After using this, you can now **tell how many extra sales a campaign really caused, how sure that is, and whether the
spend paid back**, which used to take a marketing-science vendor or an analyst with R.

## Model

- Input: wide (`date,RegionA,RegionB,...`) or long (`date,region,value`) tables, daily or weekly, with a value for
  every region on every date. Dates as `YYYY-MM-DD` or `M/D/YYYY`. Dates with a gap are dropped with a warning.
- Counterfactual: test-region total regressed on the comparison regions before the start date with non-negative
  weights (coordinate-descent NNLS, no intercept). The weights predict the no-campaign value afterwards.
- Interval: rolling-origin placebo windows of the campaign's length inside the pre-period (refit on earlier days;
  leave-window-out when history is short). 90% interval = lift minus the 5th/95th percentiles of the fake gaps;
  p-value = share of fake gaps at least as large as the real one. Also reports the minimum detectable lift.
- Money: iROAS, profit after spend at a given gross margin, break-even iROAS (1/margin), or cost per incremental order.
- Second opinion: difference in differences against the pooled comparison regions; warns when it points the other way.
- Refuses: fewer than 14 pre or 3 post periods, unknown test names, no comparison region. Flags poor pre-fit
  (R² under 0.5) as unreliable, one region carrying over 80% of the counterfactual, and few placebo windows.

## Limits

Spillover between regions, region-specific promotions and stock-outs, slow-ramping effects and long-run brand effects
are not modelled. Placebo windows overlap, so the interval and p-value are approximate. Verified only against
simulated panels with known lifts. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
