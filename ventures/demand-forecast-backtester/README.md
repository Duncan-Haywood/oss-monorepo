# Demand Forecast Back-Tester

A free browser tool for small sellers, wholesalers and shops: **drop in a sales export (date, SKU, units) and get a
back-tested demand forecast for every product, with safety stock and a reorder point at your service level.** It
replays seven standard forecasting methods on your own history, picks the one that would have predicted best, and
reports how it did on points it was *not* chosen on, against simply repeating last period. When nothing beats the
naive forecast it says so. Nothing is uploaded.

**Live tool:** https://marisstella.app/demand-forecast-backtester/

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
- Order list (optional stock file `sku,on_hand[,on_order,moq,pack_size]`): inventory position = on hand + on order; at or
  below the reorder point, order up to the reorder point plus the cover days (default one more lead time) of forecast
  demand, raised to the minimum order and rounded up to whole packs. Flags SKUs that will run out before delivery and
  SKUs with excess cover. CLI: `node cli.mjs --stock stock.csv sales.csv`.
- Order calendar (optional `--order-cost`, and a `unit_cost` column in the stock file): the winning method forecasts
  26 weeks or 12 months (`--plan`); safety stock stays as a floor; stock on hand and on order covers the lead time,
  and any shortfall there is flagged, not planned. From the first period an order can land, the net requirements
  are planned to minimise order costs plus holding costs exactly by the Wagner-Whitin dynamic programme (Wagner and
  Whitin 1958, *Management Science* 5(1):89-96), and three rules of thumb are priced on the same forecast:
  Silver-Meal (Silver and Meal 1973, *Production and Inventory Management* 14(2):64-74), a period order quantity
  from the EOQ, and lot-for-lot. Holding cost per unit per period = unit cost x yearly rate (default 25%, a round
  assumption, not a measured figure) x period days / 365. `lotsize.mjs`; `--schedule-csv` prints the orders.
  Minimums, packs, price breaks and the end-of-horizon effect are not optimised (minimums and packs are flagged).
- Classes: ABC by cumulative units (80/15/5); XYZ by coefficient of variation (0.5 / 1.0).

Not modelled: stock-outs (sales are not demand; zero-heavy SKUs are flagged), promotions, price changes, moving
holidays, supplier lead-time variability, shelf life, budget limits, substitution; holding cost only in the order calendar.

**Checked so far.** Unit tests cover the inverse-normal against table values, each method on a series where the
answer is known (flat, ramp, exact seasonal cycle, lumpy demand), that the back-test never lets a method see the period
it forecasts, and that a perfectly seasonal series is won by a seasonal method. On the built-in *invented* data (20
SKUs, 48 months, seeded) the chosen methods' pooled lead-time error on unseen points is about 8% against about 16%
repeating last month. That number comes from data built to contain trend and seasonality, so it shows the machinery
works, not that your data will behave. On one invented stable SKU the pick lost to naive on unseen points (-93%), which
the tool reports rather than hides. The Wagner-Whitin plan equals brute force over every possible order plan on 400 seeded random cases of up to 10
periods, and no rule of thumb ever beats it on 300 more (`lotsize.test.mjs`). `node lotsize-bench.mjs` measures the
rules of thumb on 2,000 invented 12-period cases per demand spread: Silver-Meal averages 1.7-2.3% above the exact
cost (worst 13-26%); the period order quantity 1.5% for steady demand but 12-13% for lumpy demand (worst 96%);
ordering every period 43-72%. **Unverified** against a published retail dataset or a commercial planning tool.

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
node cli.mjs --stock stock.csv --order-cost 60 sales.csv # plus the cheapest order calendar (stock needs unit_cost)
node cli.mjs --stock stock.csv --order-cost 60 --schedule-csv sales.csv > orders.csv
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
`stock_loaded`, `report_downloaded`, `calendar_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
