# Restaurant Delivery Commission Analyzer

A free browser tool for independent restaurants: **drop in a DoorDash, Uber Eats or
Grubhub merchant payout or order-level financial report CSV and see what the platform
really costs you.** The file is read in the browser; nothing is uploaded and no platform
login is needed.

**Live tool:** https://marisstella.app/restaurant-delivery-commission-analyzer/

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

## Known gaps (quality audit, 2026-11-13)

From `portfolio/quality/audits/2026-11-13-restaurant-delivery-commission-analyzer.json`:
- Every amount goes through `Math.abs` (`calc.mjs:208`), so a credit counts as a cost and a refund as a sale: a $6 error charge and its +$6 reversal count as $12 of charges, and a refund row with subtotal -15 adds $15 of food sales and an order. The page discloses "charges are read as costs whatever their sign", but any month with adjustments or refunds is wrong. Fixing it needs per-column sign detection and refund rows kept apart.
- Fee columns that match no alias are ignored without a notice, so a fee column under an unexpected name lowers the take rate silently.
- Pickup and delivery orders are blended into one rate per platform, though DoorDash prices pickup at 6% and Uber Eats at about 7%.
- Three seeded threshold changes survived the tests (payout-gap 1%, the end of the lunch daypart, the 30% take-rate severity boundary).
