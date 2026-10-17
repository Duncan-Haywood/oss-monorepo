# STR Turnover Crew Planner

Booking turnovers in the order owners ask, or biggest fee first, fills a busy checkout day with the wrong work.
Paste the day's turnovers (fee, supplies, clean minutes, checkout, next check-in, where each unit is) and get the
exact set of cleans with the highest profit, which of your one to three crews does each and in what order, the
fee each declined turnover would need, what a second or third crew adds, and what first-come and biggest-fee-first
booking leave behind. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/str-turnover-crew-planner/

```
node cli.mjs plan turnovers.csv --crews 2 --start 09:00 --end 18:00 --hourly 40 --json
cat turnovers.csv | node cli.mjs plan - --crews 3 --speed 25
```

Input: rows of `name,fee,supplies,clean_min,checkout,next_checkin,east_miles,north_miles[,note]`. See `fixtures/jobs.csv`.

## How it decides

A turnover earns its fee less supplies less the crew's hourly cost of its clean minutes. Each drive costs a
per-mile amount plus the hourly cost of the drive minutes; drive minutes are straight-line miles x circuity /
speed. A crew cannot start before checkout and must finish by the next check-in. Waiting for a checkout is free.
Crews leave the depot at shift start and must be home by shift end. One crew's best route over every set of
turnovers is found exactly by dynamic programming over (set done, last turnover), keeping every non-dominated
(finish time, profit) pair; the best split across up to three identical crews is then found exactly over every
partition of the queue. The tests check both against every assignment and every order. A declined turnover's
break-even fee is exact: its fee plus the gap between the best day and the best day forced to include it.

## What it is not

Not a forecast and not a routing service: one depot, identical crews, straight-line distance times your circuity
factor, up to 12 turnovers. Traffic, parking, crews of different speed or pay, early check-ins and cancellations
are not modelled. Not financial or business advice, no warranty. It does not know your management contracts or
guest-ready standards; a late clean can strand a guest, so do not cut windows closer than you can keep.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
