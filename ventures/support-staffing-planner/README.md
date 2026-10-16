# Support Staffing Planner

How many agents does a phone, chat or ticket queue need in every half hour, and what is the cheapest set of
shifts that covers them? Paste contacts per interval for a typical week, set a service target (for example 80%
answered within 20 seconds), shrinkage, an occupancy cap, the shift lengths you allow and an hourly cost.
Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/support-staffing-planner/

```
node cli.mjs plan demand.csv --sl 80 --answer 20 --shrinkage 30 --shifts 8,4 --wage 22 --json
cat demand.csv | node cli.mjs plan - --sl 90 --answer 30
```

Input: rows of `day,start,contacts[,aht_seconds]`, one per interval (start `HH:MM`). See `fixtures/demand.csv`.

## How it decides

Workload (erlangs) = contacts x handle time / interval length. The fewest agents on the queue that meet the
service target by the Erlang C formula, and stay under the occupancy cap, are found by search. Scheduled agents =
on-queue / (1 - shrinkage). The cheapest set of shifts covering that requirement in every interval is an
interval-covering problem solved exactly as a min-cost flow; the tests check it against trying every combination
of shifts on small cases and the Erlang C code against the textbook sum. It also prices other service targets,
re-solves with handle time, volume and shrinkage changed, and compares with flat peak staffing, full-length shifts
only and the occupancy-only rule (which misses the target at low volumes).

## What it is not

Not a forecast: it plans from the volumes and handle times you supply. Erlang C assumes random arrivals and no
abandonment, so real service is usually a little worse. No skills routing, callbacks, chat concurrency or named
people (see shift-roster-builder for that). Not legal or employment advice, no warranty; you remain responsible for
working-time and break rules.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
