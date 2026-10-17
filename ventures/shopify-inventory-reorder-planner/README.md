# Inventory Reorder Planner

A free browser tool for small online sellers: **load your orders export and a stock export and
see what to reorder, how many, and which stock is dead cash.** Files are read in the browser;
nothing is uploaded and no app install or store login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shopify-inventory-reorder-planner/

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
velocity x lead time + z x weekly-sd/sqrt(7) x sqrt(lead time). Order quantity tops position up to
velocity x (lead + cover days) + safety stock. Sales at risk = velocity x price x uncovered days.
Seasonality, promotions, supplier minimums and out-of-stock-censored demand are not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
