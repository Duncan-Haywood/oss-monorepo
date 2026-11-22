# Inventory Reorder Planner

A free browser tool for small online sellers: **load your orders export and a stock export and
see what to reorder, how many, and which stock is dead cash.** Files are read in the browser;
nothing is uploaded and no app install or store login is needed.

**Live tool:** https://marisstella.app/shopify-inventory-reorder-planner/

After using this, you can now **get a per-SKU reorder point with safety stock, an order quantity
and cost, days of cover, revenue at risk from stock-outs and the cash tied up in overstock and
dead stock**, which used to mean a paid inventory-planning app or a hand-built spreadsheet.

## Input

Sales: any CSV with a date, a SKU (or product name) and a quantity. Shopify's Orders export
(`Created at`, `Lineitem sku`, `Lineitem quantity`, `Lineitem price`) is read as it is; cancelled
and refunded orders are dropped and negative quantities net against the SKU. Stock (needed for
reorder points): a SKU and an `On hand` or `Available` column, plus `Incoming` and `Cost per item`
if present. **Column names are matched by alias and no real Shopify export was available**; rows
that cannot be read are listed with a line number and reason.

## Model

Velocity = units/day (60% last 28 days + 40% whole file once there are 8 weeks). Reorder point =
velocity x lead time + safety stock, with safety stock chosen per SKU (`safetyMethod: "auto"`,
2026-11-22): SKUs that sell on fewer than 1 day in 1.32 (lumpy or intermittent) take the
service-level quantile of their own demand over every run of lead-time days in the file
(`leadTimeQuantile`); steady sellers keep z x weekly-sd/sqrt(7) x sqrt(lead time). The page can
force either rule. Order quantity tops position up to
velocity x (lead + cover days) + safety stock. Sales at risk = velocity x price x uncovered days.
Weekly sd uses whole weeks only (days before the oldest whole week are left out). Stock rows for
the same SKU, such as Shopify's one row per location, are added up and the plan lists them.
Seasonality, promotions, supplier minimums and out-of-stock-censored demand are not modelled.

## Measured on a real store (2026-11-22)

Replayed on UCI's Online Retail II (a UK online seller's 1,067,371 order lines, CC BY 4.0) with
`eval/backtest.mjs`: 3,078 SKUs, a year's holdout, plans rerun every 28 days, lost sales. At the
default 95% service level and a 14-day lead time, the per-SKU rule kept the shelf stocked through
80.7% of lead times against 77.5% for the old rule, sold 0.3 points more of demand and carried 3.5%
less stock (paired bootstrap over SKUs: +3.2 [2.5, 3.9] points, +0.3 [0.1, 0.5], -3.5%
[-5.7, -1.5]). At equal stock it keeps more lead times stocked at every comparable point across
lead times of 7, 14 and 28 days and a 180-day window. Neither rule reaches the promised 95% on this
lumpy, wholesale-heavy store (77-83%); the page says so. The store has no steady daily sellers, so
those keep the old rule. Full write-up: `eval/backtest-2026-11-22.md`. The replay also found that a
file past roughly 120,000 lines crashed the page (`Math.min(...spread)`) and that invoice-style
columns (`StockCode`, `InvoiceDate`, `Description`) were not read; both are fixed.

## Who else does this

Shopify's Stocky app, Inventory Planner, Prediko, Cogsy and similar apps plan reorders from a
store's sales, mostly for a monthly fee and through a connection to the store. This page needs no
login or install and reads any orders CSV, and its reorder rule is published with a replay on real
orders that anyone can rerun.

## Run

Open `index.html` through any static server. Tests: `node --test`.
