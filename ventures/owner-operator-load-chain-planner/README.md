# Owner Operator Load Chain Planner

The load with the best posted rate per mile is often the wrong next load: the empty run to its pickup, the hours spent
waiting for its window to open and the rest you are forced to take before it all come out of the same week. Paste a
shortlist from the load board (pickup, drop, rate, pickup window, delivery deadline) with your own costs, say where you are
and how many hours you are free, and get the exact best chain to run, which loads to leave, and the lowest rate each load in
the plan is worth. For owner-operators, hotshot and box-truck drivers who choose their own loads. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/owner-operator-load-chain-planner/

```
node cli.mjs plan loads.csv --start "Dallas TX" --horizon 120
cat loads.csv | node cli.mjs plan - --start "Dallas TX" --per-day --return-home --json
node cli.mjs cities
```

Input: rows of `name,from,to,rate[,miles,pickup_open,pickup_close,deliver_by,extra,note]`. Cities are written `Dallas TX`
(no comma; `node cli.mjs cities` lists the 82 built in) or as coordinates `@32.78/-96.80`. Times are hours after you are ready
(day 2 at 8am is 32). See `fixtures/loads.csv`.

## Your estimates, not a market rate

Every rate, fuel price, speed, cost and time window is a number you type. The tool reads no load board, knows no market rates
and predicts no rate or availability. Distances are straight-line miles between approximate city centres times a road factor
(1.2 by default); give a load's own miles when you have them, and expect short hauls to be rougher than long ones.

## How it decides

A chain's profit is the pay of each load, less its extras, less every mile driven (loaded and empty, including the empty run
home if you ask for it) at fuel per mile plus your other per-mile costs. Driving follows a simplified rule: after the drive
hours you set (11) a rest of the hours you set (10) is added; waiting at a pickup for its window to open longer than the
rest resets the clock; arriving after a window closes, or after a delivery deadline, makes a load impossible. The best chain
is found exactly with a dynamic programme over (set of loads, last load) that keeps every Pareto-optimal (clock, drive
hours, profit) state, so no ordering is assumed. Two objectives: `total` profit inside the window you are free, or profit per
day the chain takes. For each load in the plan the walk-away rate is exact: the lowest rate at which it still beats the
best plan without it. The tests check the search against every ordered subset (random lists, both objectives, rest rule on
and off, with and without the run home) and check each walk-away rate by re-planning a dollar either side of it. The search
is capped at 14 loads, and says so if it stops early.

## What it is not

Not a market rate, a route planner, a dispatcher, an hours-of-service or logbook tool, tax or financial advice, and no
warranty. It ignores traffic, weather, parking, fuel-stop prices, weigh stations, detention, broker credit, real routes and
what a driver is legally allowed to do. Compliance with driving-time rules, load acceptance, permits and safety are yours.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.
Anonymous feature counts (`plan_run`, `example_loaded`) live in local storage only and can be switched off on the page;
Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
