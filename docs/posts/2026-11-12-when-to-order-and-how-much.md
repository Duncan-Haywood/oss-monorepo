---
title: "When to order, and how much: the exact answer is cheap, and the rules of thumb are usually close"
seo_title: "Wagner-Whitin vs Silver-Meal and EOQ on a sales forecast"
date: 2026-11-12
tags: [demand-forecast-backtester, ventures, operations-research]
description: "The demand forecast back-tester now plans an order calendar by exact Wagner-Whitin lot sizing. On 6,000 invented cases Silver-Meal came within about 2% on average, but up to 26% worse."
---

The [demand forecast back-tester](https://marisstella.app/demand-forecast-backtester/) already told a small seller how much stock to keep: for each product it replays seven forecasting methods on the seller's own sales, keeps the one that held up, and turns its misses into safety stock and a reorder point. With a stock file it also says what to order today.

It didn't say what to order next month, or whether to place one big order or three small ones. That trade-off is real money. Every purchase order has a fixed cost: freight minimums, the admin, receiving and counting the boxes. Every unit that sits on a shelf costs something too: the cash tied up, the space, insurance and shrinkage. Order often and you pay the first cost many times. Order rarely and you pay the second on a pile of stock.

## The exact answer has existed since 1958

If demand per period is known (here: the forecast), the cheapest plan can be found exactly. Harvey Wagner and Thomson Whitin showed in 1958 ("Dynamic version of the economic lot size model", *Management Science* 5(1)) that an optimal plan only orders when stock has run down to zero, and that each order covers a run of whole consecutive periods. That turns the search into a short dynamic programme: for each period, the cheapest way to cover everything up to it is the cheapest way to cover everything before some earlier order, plus that one order and its holding cost. For twelve months there are only 78 (start, end) pairs to compare.

Despite that, most planning spreadsheets use a rule of thumb. The best known is Silver-Meal (Edward Silver and Harlan Meal, 1973): keep extending the current order to the next period while the average cost per period covered keeps falling. Another fixes the order size at the economic order quantity, the square-root formula from 1913, expressed as a number of periods. The simplest is to order each period's demand when it comes up ("lot-for-lot").

So the tool now does all four. Enter a cost per order and add a `unit_cost` column to the stock file. It forecasts a year of months or half a year of weeks with the method that won the back-test. Safety stock stays as a floor. Stock on hand and on order covers the lead time; any shortfall there is flagged for expediting, not planned. After that it plans the cheapest order calendar, and prices each rule of thumb against the same forecast:

| Ordering rule | Order + holding cost | More than exact |
|---|---:|---:|
| Exact plan (Wagner-Whitin) | $7,709 | – |
| Silver-Meal | $7,829 | +$120 (2%) |
| Fixed EOQ, in periods | $7,855 | +$146 (2%) |
| Order every month's demand | $9,300 | +$1,591 (21%) |

That's the built-in example: 20 *invented* products, invented stock, $60 an order and 25% a year holding cost. It shows the machinery works. It doesn't describe any real shop. The page gives each product's calendar ("now: 545; in 3 months: 545; in 6 months: 727") and downloads it as a CSV.

## How close are the rules of thumb?

We wanted a number beyond one example, so `lotsize-bench.mjs` in the venture runs all four methods on 2,000 seeded random cases for each of three demand spreads. Each case is twelve periods with mean demand 100, plus uniform noise of the stated spread, clipped at zero. The order cost is set so the textbook order covers one to four periods. These cases are invented too. They compare methods, not shops.

| Demand spread (sd / mean) | Silver-Meal: mean extra | worst | Fixed EOQ: mean extra | worst | Every period: mean extra |
|---|---:|---:|---:|---:|---:|
| 0.2 (steady) | 1.7% | 13.3% | 1.5% | 16.9% | 57.7% |
| 0.6 | 2.2% | 19.6% | 11.6% | 56.7% | 71.6% |
| 1.2 (lumpy) | 2.3% | 25.8% | 13.1% | 96.4% | 43.2% |

Silver-Meal is a good heuristic: about 2% above the optimum on average whatever the noise, and exactly optimal in about half the cases. A fixed economic order quantity holds up when demand is steady and falls apart when it's lumpy, because a fixed number of periods ignores the size of the periods it covers. Ordering every period is the expensive habit whenever orders cost real money.

The average hides the tail, though. One case in ten, Silver-Meal costs 6 to 7% more than it has to, and the worst case was 26%. The smallest example we know of is in the tests: flat demand of 30 a period for four periods, $100 an order, $1 a unit a period to hold. Silver-Meal covers three periods and then orders the fourth alone, for $290. Two orders of 60 cost $260. The exact method costs nothing extra to run here: in Node on this run's machine, twelve-month plans for a thousand products took 17 ms. So the tool uses it and keeps the heuristics only as a yardstick.

## How we know the exact plan is exact

The unit tests enumerate every possible order plan (all 2^(n-1) of them) for 400 seeded random cases of up to ten periods. The dynamic programme matched the brute-force minimum every time. On 300 more cases, no heuristic ever came out cheaper than it, and every plan from every method covers all the demand without a shortfall. A separate test re-prices the plan the page shows from scratch and checks that each order is placed one lead time before it lands.

## What it doesn't do

The plan is only as good as the forecast. The back-test still reports, for each product, whether the forecast beat simply repeating last month. Minimum order quantities, pack sizes and price breaks aren't optimised: the tool flags them, and you round up. A plan with a fixed end also tends to order a little too little near the horizon. Re-run it each month rather than following month nine of an old plan. The 25% holding rate is a round starting assumption, not a measured figure, so put in your own.

The sales file still never leaves the browser. The code is MIT licensed, in [`ventures/demand-forecast-backtester/lotsize.mjs`](../../ventures/demand-forecast-backtester/lotsize.mjs). If it pays off, the next step is the price-break version of the same problem. Suppliers' quantity discounts are where a purchasing decision moves the most money, and the exact answer there is still tractable.
