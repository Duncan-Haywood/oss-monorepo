# Demand Forecast Back-Tester

A free browser tool for small sellers, wholesalers and shops: **drop in a sales export (date, SKU, units) and get a
back-tested demand forecast for every product, with safety stock and a reorder point at your service level.** It
replays seven standard forecasting methods on your own history, picks the one that would have predicted best, and
reports how it did on points it was *not* chosen on, against simply repeating last period. When nothing beats the
naive forecast it says so. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/demand-forecast-backtester/

After using this, you can now **see which SKUs a forecast actually helps with, how much safety stock your service level
needs, when to reorder, and which items deserve tight control (A-X) and which a simple min/max rule (C-Z)**, which used
to mean paid inventory-planning software or a data analyst.

## Method

- Sales are summed into weeks (Monday start) or months. With daily rows a part-filled first or last period is dropped;
  each SKU's history starts at its first sale. Returns net against sales.
- Methods: repeat last period; moving average (8 weeks / 3 months); exponential smoothing (grid-fitted alpha); Croston
  with the Syntetos-Boylan correction for intermittent demand; damped-trend smoothing (Gardner & McKenzie 1985);
  and, with two full years plus six back-test points, same-period-last-year and additive Holt-Winters without trend.
- Back-test: up to 30 forecast origins. At each, a method sees only earlier data and forecasts the whole lead time; the
  error in total lead-time demand is recorded. With 9+ origins the winner is chosen on the older two thirds (simpler
  method unless another is 3% better) and scored on the newest third. Fewer origins are flagged as optimistic.
- Stock: safety stock = normal quantile(service level) x RMS lead-time error of the winner over all origins; reorder
  point = forecast lead-time demand + safety stock; interval = forecast +/- 1.96 x that error.
- Classes: ABC by cumulative units (80/15/5); XYZ by coefficient of variation (0.5 / 1.0).

Not modelled: stock-outs (sales are not demand; zero-heavy SKUs are flagged), promotions, price changes, moving
holidays, supplier lead-time variability, order minimums, shelf life, substitution, holding cost.

**Checked so far.** Unit tests cover the inverse-normal against table values, each method on a series where the
answer is known (flat, ramp, exact seasonal cycle, lumpy demand), that the back-test never lets a method see the period
it forecasts, and that a perfectly seasonal series is won by a seasonal method. On the built-in *invented* data (20
SKUs, 48 months, seeded) the chosen methods' pooled lead-time error on unseen points is about 8% against about 16%
repeating last month. That number comes from data built to contain trend and seasonality, so it shows the machinery
works, not that your data will behave. On one invented stable SKU the pick lost to naive on unseen points (-93%), which
the tool reports rather than hides. **Unverified** against a published retail dataset or a commercial planning tool.

## Alternatives, and what this does differently

Inventory forecasting today is a paid planning app (typically tens to hundreds of dollars a month, connected to your
store), a consultant, or a spreadsheet moving average. The apps rarely show how often their forecast beat "same as
last month". This tool runs on an export on your own machine, shows the back-test, and reports honestly when the model
adds nothing. It does not connect to a store, place purchase orders or know your stock on hand.

## Run

Open `index.html` through any static server. Tests: `node --test`.

**Command line** (Node 18+, no install, nothing sent anywhere):

```
node cli.mjs sales.csv                                   # summary, findings, top 15 SKUs
node cli.mjs --period month --lead 45 --service 97 sales.csv
node cli.mjs --csv sales.csv > reorder.csv               # one row per SKU, for a spreadsheet
node cli.mjs --json sales.csv                            # full analysis for scripts
node cli.mjs --example                                   # try it on synthetic data
```

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of e-commerce platforms and inventory software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `file_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
