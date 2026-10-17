# Used Car Lot Aging Planner

"Wait until it sells" pays floorplan interest, curtailments and lot costs on units that lose value every week. Paste
an independent dealer's inventory (days on lot, total cost, floored amount, expected retail and wholesale values and
how fast each falls, expected days to retail, daily holding cost) and get each unit's true carrying cost to date and
per day, the exact best day to wholesale it, which units to wholesale now ranked by what they earn per $1,000 of
floorplan line per day, and the dollars a wait-until-it-sells policy leaves behind. Browser page or zero-dependency
CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/used-car-lot-aging-planner/

After using this, you can now see in one paste which aged units to send to auction this week and the day to send the
rest, with what each one costs to keep, which used to take a spreadsheet per unit and a gut call at the 90-day
curtailment.

```
node cli.mjs plan lot.csv --apr 9 --cash-rate 6 --max-age 180 --curtail 90:10,120:10,150:10
cat lot.csv | node cli.mjs plan - --line-value 2 --json
```

Input: rows of `stock,days,cost,floored,retail,wholesale,retail_drop_30,wholesale_drop_30,days_to_sell,daily_hold[,note]`.
See `fixtures/lot.csv`.

## How it decides

Each day a unit stays costs floorplan interest on the balance still owed (curtailments pay it down on your schedule),
what your own cash in the unit could earn at your cash rate, and the daily holding cost; optionally also what that
much line would earn on a fresh unit (`--line-value`, per $1,000 per day). Each day it retails with chance
1 / expected days to retail at your expected retail price; otherwise both prices fall by your drop per 30 days. At the
floorplan limit an unsold unit is wholesaled.

While a unit is unsold only its age changes, so every plan is "retail until day T, then wholesale". The best T is found
exactly by backward induction over age; the tests check it against evaluating every T directly. Units to wholesale
now come first, then the rest ranked by what holding adds over wholesaling today per $1,000 of line per day. "Waiting
leaves behind" is the expected value of the plan less the expected value of holding to the limit.

## What it is not

Not a forecast and not a valuation guide: prices fall in a straight line at the rates you type and the daily chance of
a retail sale is constant. Seasonality, a price cut that speeds a sale, reconditioning still to do, trade-in and F&I
income, and your lender's fees and audit rules are not modelled. Not financial, lending or business advice, no
warranty. Your floorplan agreement's curtailment and payoff terms come first.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.
Feature counts (`plan_run`, `example_loaded`) stay in local storage, can be switched off, and honour Do Not Track and
Global Privacy Control.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
