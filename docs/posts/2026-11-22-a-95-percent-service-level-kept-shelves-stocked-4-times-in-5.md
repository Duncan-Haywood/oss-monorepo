---
title: "A 95% service level kept a real store's shelves stocked about 4 times in 5"
seo_title: "Safety stock replayed on a real store: 95% setting, 81% delivered"
date: 2026-11-22
tags: [inventory, ecommerce, forecasting, ventures]
description: "We replayed our free reorder planner on a real online seller's year of orders. It delivered less than the service level it promised; a per-SKU rule did better."
---

Every reorder tool asks for a "service level": 95% means you expect to get through 19 of every 20 supplier lead times without running out. Our free [inventory reorder planner](https://marisstella.app/shopify-inventory-reorder-planner/) asked for one too, and turned it into safety stock with the textbook formula: a z-score times the SKU's week-to-week variation, scaled to the lead time.

We had never checked what that promise is worth on real sales. So we replayed it on a public dataset: UCI's Online Retail II, every order line of a UK online giftware seller over two years (1,067,371 lines, CC BY 4.0). The replay plays a seller who re-runs the planner every four weeks on their latest year of orders and orders whenever stock plus orders in transit falls to the reorder point. Goods land 14 days later, and a customer who finds an empty shelf is a lost sale. It covered 3,078 SKUs over a held-out year.

**At a 95% setting, the shelf stayed stocked through 77.5% of lead times.** At 99%, 81.3%. This seller's demand is lumpy: many of its customers are wholesalers, and one order can be bigger than the whole buffer. A bell curve fitted to weekly totals smooths those orders away.

We tried a different rule for SKUs like that. Take every 14-day run of the SKU's own sales in the file, and set the reorder point at the run your service level names: the 95th-percentile run at 95%. It needs no distribution; the big orders are already in the runs. At the same 95% setting it kept the shelf stocked through **80.7%** of lead times, sold slightly more of what customers wanted, and carried **3.5% less stock**. A paired bootstrap over SKUs puts the gain at +3.2 points (95% interval 2.5 to 3.9) and the stock saving at 1.5% to 5.7%. With 7- and 28-day lead times and a shorter 180-day history, it kept more lead times stocked at the same stock every time.

So the planner now picks per SKU. Products that sell on fewer than about three days in four (the standard cut-off for intermittent demand) use their own lead-time runs. Steady daily sellers keep the old rule, because this store had none and we have not tested them. A new column says which rule each SKU used, and a note beside the setting says plainly that the level is a target, not a guarantee.

Feeding a million real lines through the page also found two plain bugs. Any export past about 120,000 lines crashed it: the earliest date was taken with `Math.min(...allLines)`, and JavaScript caps how many arguments a call can take. And an invoice-style export with `StockCode` and `InvoiceDate` columns was refused outright. Both are fixed and tested.

The write-up, tables and the script to rerun it are in the project's [`eval/backtest-2026-11-22.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/shopify-inventory-reorder-planner/eval/backtest-2026-11-22.md). The tool runs in your browser and never uploads your files.
