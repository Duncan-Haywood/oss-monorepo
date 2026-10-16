# Restaurant Delivery Commission Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/restaurant-delivery-commission-analyzer/>

A free browser tool for independent restaurants: **drop in a DoorDash, Uber Eats or
Grubhub merchant payout or order-level financial report CSV and see what the platform
really costs you.** The file is read in the browser; nothing is uploaded and no platform
login is needed.

After using this, you can now **see per-platform and per-order effective take rate
(commission, delivery and service fees, promotions, ad spend and error charges over food
sales), net cash per order, net after your food cost and packaging, the orders that lost
money, promo and ad return, weekday and daypart patterns, the menu markup that matches
in-store margin, and what the same sales would earn on your own ordering**, which used to
mean reconciling three portals in a spreadsheet.

## Input

Any CSV with an order date/time and a food sales amount (`Subtotal`, `Food sales`).
`Commission` / `Marketplace fee`, `Delivery fee` / `Service fee`, `Marketing fees` /
`Promotions`, `Ad spend`, `Error charges` / `Refunds`, `Platform` / `Channel`, `Order
status`, `Order ID` and a payout column (`Net total`, `Net payout`) are used when present.
**Column names are matched by alias from memory of the three platforms' exports; no real
export was available.** Comma/tab/semicolon files, quoted fields, US and day-first dates
and UTF-16 exports are read. Unreadable rows are listed with a line number and reason.
Several files (one per platform) can be loaded together.

## Model

Net cash = food sales minus every charge column. Net after costs also takes off your
typed food cost % (of the in-store price) and packaging per order. The file's payout
column is only reconciled against net cash, never used as it. Weekday and daypart groups
under five orders are ignored. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
