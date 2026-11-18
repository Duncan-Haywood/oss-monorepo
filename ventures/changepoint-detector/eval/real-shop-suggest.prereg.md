# A real shop's daily series through `--suggest` (pre-registered 2026-11-18, before any watch ran on it)

Written before any watch, replay or detector touched the series below. Only the daily CSV's shape (which days are
zero) was looked at, to build it.

## Data

UCI Online Retail (Chen, Sain and Guo 2012; CC BY 4.0): every invoice line of a UK online gift retailer,
2010-12-01 to 2011-12-09, 541,909 lines, fetched from the copy in databricks/Spark-The-Definitive-Guide
(`data/retail-data/all/online-retail-dataset.csv`). `eval/real-shop-daily.py` turns it into
`data/online-retail-daily.csv`, one row per calendar day, in the shape `stripe-metrics.mjs` writes: zeros on days with
nothing (374 days). Columns: `orders` (distinct invoices that are not cancellations, with any line of positive
quantity and price), `revenue` (their gross, GBP), `cancellations` (distinct `C` invoices), `new_customers` (customer
ids on their first day).

The shop does not trade on Saturdays (53 zero Saturdays). The other zero days are a calendar fact, not something read
off the watch: the Christmas closure (every day 2010-12-24 to 2011-01-03) and six single-day UK bank holidays
(2011-04-22, 04-25, 04-29, 05-02, 05-30, 08-29).

## Runs (fixed now)

`node watch.mjs data/online-retail-daily.csv --suggest --columns orders:poisson,revenue,cancellations:poisson,new_customers:poisson`
(the Stripe workflow's default column models: counts Poisson, revenue mean), at the default budget (2 per 100
checks) and at `--alerts-per 1/month`; each once without and once with `--period 7`. Nothing else is tuned.

## Bars

- **B1, the default on a real shop:** Quiet sends at most 2 alerts per 100 checks on each of the 4 columns, without
  `--period`. (Fails: a deployer's first `--suggest` on a real shop says "even Quiet is over budget".)
- **B2, the weekly cycle helps:** with `--period 7`, Quiet's alerts summed over the 4 columns fall by at least 25%,
  and no column's rise.
- **B3, one-day closures are not changes:** at the suggested setting of each column, no alert is dated within one day
  of a single-day bank holiday.

Every alert is listed with its date and the level before and after, so a reader can judge the unlabelled ones. The
autumn 2011 rise (the Christmas build-up) is the one change a shop owner would plainly want to hear about; whether it
is heard, and how late, is reported, not barred.

What ships depends on the bars: B2 passing makes a weekly cycle the advice (and, if the CLI lacks it, a per-column
period) for a daily shop watch; B2 failing is written up as such and nothing changes.
