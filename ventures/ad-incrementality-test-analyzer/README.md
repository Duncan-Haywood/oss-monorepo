# Ad Incrementality Test Analyzer

A free browser tool for anyone who runs ads: **paste sales by store or region, name the test regions and the campaign
start date, and get the incremental lift with an interval, incremental ROAS, profit after ad spend, and the smallest
lift the test could have detected.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ad-incrementality-test-analyzer/

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

## Plan a test before you spend (`plan.mjs`)

Paste sales history with no campaign in it, say how many regions will run ads and for how many periods, and the
planner ranks splits of regions into campaign and comparison groups. For each split it replays up to 12 fake campaigns
of that length on the history (fit on earlier periods, predict forward, same non-negative regression as the analyzer)
and reports the smallest lift that split could tell from noise (half the 5th-to-95th percentile spread of the fake
lifts), the pre-fit R² and the split's share of sales. It also shows how that detectable lift changes with campaign
length. Up to 120 splits are tried; beyond that it samples them with a fixed seed and says so. Needs 3+ regions and at
least max(28, 2 x length) periods. Tested on simulated panels where one region is deliberately erratic.

## Limits

Spillover between regions, region-specific promotions and stock-outs, slow-ramping effects and long-run brand effects
are not modelled. Placebo windows overlap, so the interval and p-value are approximate. Verified only against
simulated panels with known lifts. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
