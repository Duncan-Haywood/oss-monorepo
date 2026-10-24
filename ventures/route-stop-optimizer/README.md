# Route Stop Optimizer

A free browser tool for mobile service businesses, couriers, inspectors, sales reps and home-visit professionals:
**paste the day's stops (latitude, longitude, how long each takes, and any customer time window), and get the order that
cuts drive time, split across as many drivers as you have**, with arrival times, what it saves against the order you had,
and what your customer windows cost. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/route-stop-optimizer/

After using this, you can now **see how many miles, hours and dollars a better stop order saves per day and per year, and
open the route in Google Maps**, which used to be a guess or a paid route-planning subscription.

## Model

- Input: rows of `[name,] latitude, longitude [, service minutes [, open [, close]]]`, plus a depot. Times may be `9`,
  `9:30`, `9am`, `13:30`.
- Travel time = straight-line (haversine) miles x a road factor (default 1.3) at an average speed (default 30 mph).
  That is an estimate, not a road network; it ranks orders well but will not match a navigation app minute for minute.
- Objective: least elapsed time (driving + waiting for a window to open + service), every window respected if any order
  can. If none can, windows are soft and the plan minimises lateness first.
- Up to 12 stops on one route: solved **exactly** (Held-Karp dynamic programme; earliest-arrival state is optimal under
  waiting). Above that, and for several drivers: multi-start nearest-neighbour, 2-opt and Or-opt; drivers are split by
  angle around the depot and improved by moving stops between routes. Tests compare the exact solver with brute force and
  check the heuristic stays within 5% of it.
- Also reported: the same plan with windows removed (what windows cost) and the listed-order baseline.

## Limits

Not modelled: real road network, one-way streets, live traffic, vehicle capacity, driver shifts or breaks, stops that
must be visited in a fixed order (pickup before drop-off), and turn-by-turn directions. Verified only against brute force
and invented data. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
