# Route Stop Optimizer

A free browser tool for mobile service businesses, couriers, inspectors, sales reps and home-visit professionals:
**paste the day's stops (latitude, longitude, how long each takes, and any customer time window), and get the order that
cuts drive time, split across as many drivers as you have**, with arrival times, what it saves against the order you had,
and what your customer windows cost. Nothing is uploaded.

**Live tool:** https://marisstella.app/route-stop-optimizer/

After using this, you can now **see how many miles, hours and dollars a better stop order saves per day and per year, and
open the route in Google Maps**, which used to be a guess or a paid route-planning subscription.

## Model

- Input: rows of `[name,] latitude, longitude [, service minutes [, open [, close [, load]]]]`, plus a depot and an
  optional vehicle capacity (same unit as load: boxes, kg, gallons). Times may be `9`,
  `9:30`, `9am`, `13:30`.
- Travel time = straight-line (haversine) miles x a road factor (default 1.3) at an average speed (default 30 mph).
  That is an estimate, not a road network; it ranks orders well but will not match a navigation app minute for minute.
- Objective: least elapsed time (driving + waiting for a window to open + service), every window respected if any order
  can. If none can, windows are soft and the plan minimises lateness first.
- Up to 12 stops on one route: solved **exactly** (Held-Karp dynamic programme; earliest-arrival state is optimal under
  waiting). Above that, and for several drivers: multi-start nearest-neighbour, 2-opt and Or-opt; drivers are split by
  angle around the depot and improved by moving stops between routes. Tests compare the exact solver with brute force and
  check the heuristic stays within 5% of it.
- Every heuristic plan also runs the **CVRPTW engine** (`vrptw.mjs`): ruin and recreate with adjacent string removal
  and simulated annealing (Christiaens & Vanden Berghe, Transportation Science 2020), hard windows, warm-started from the
  plan above. The tool keeps whichever plan scores better on its own objective, so it can only help. With a vehicle
  capacity set, the engine plans alone, keeps each driver's load under the capacity, and names any stop that fits no
  driver's load and windows instead of planning it late.
- Also reported: the same plan with windows removed (what windows cost) and the listed-order baseline.

## Limits

Not modelled: real road network, one-way streets, live traffic, driver shifts or breaks, stops that
must be visited in a fixed order (pickup before drop-off), and turn-by-turn directions. Verified only against brute force
and invented data. Not legal, tax, or financial advice.

## The routing engine, measured (2026-11-18)

`vrptw.mjs` has no dependencies and is the same file in the page and the benchmark.

- **Solomon VRPTW, all 56 instances of 100 customers** (DIMACS convention: distances truncated to one decimal, objective
  total distance, fleet capped), against the best-known solutions from CVRPLIB via
  [PyVRP/Instances](https://github.com/PyVRP/Instances) (MIT): **mean gap 0.44%**, 26 of 56 equal to the best known,
  56 of 56 plans feasible, 14 s per instance (200,000 iterations, one seed). Every published route set was re-scored by
  the same checker and matched its stated cost before any gap was counted. Worst: C206 at 6.4% and C204 at 5.0%, one
  route more than the best known. Full table and method: [eval/solomon-2026-11-18.md](eval/solomon-2026-11-18.md);
  rerun with `node eval/solomon.mjs DIR`.
- **Exact check:** on 40 random 6-customer instances with windows and capacity, the engine finds the brute-force optimum
  every time (`vrptw.test.mjs`).
- **Inside the tool** (`node eval/tool-compare.mjs`, invented service days around the sample depot, a third of stops
  with a 2 to 4 hour window): over 20 days per shape, the
  engine's plan was kept on 5 of 20 single-driver 25-stop days (mean score cut 0.75%), 4 of 20 two-driver 40-stop days
  (mean cut 8.65%: the old search left late stops on 2 of those days, the engine none), 1 of 20 at 60 and 100 stops, and
  0 of 20 at 150 stops on 8 drivers. On balanced multi-driver days the old balancing search usually still wins, since
  the engine minimises drive time and the tool also weighs the longest day (next item 2). Cost: about 0.2 s at 25 stops
  and 1.8 s at 150 in Node.
  | stops | drivers | days kept | mean cut | days with late stops, old / new | ms old / new |
  |---|---|---|---|---|---|
  | 25 | 1 | 5 of 20 | 0.75% | 6 / 6 | 55 / 197 |
  | 40 | 2 | 4 of 20 | 8.65% | 2 / 0 | 76 / 376 |
  | 60 | 3 | 1 of 20 | 0.11% | 0 / 0 | 145 / 628 |
  | 100 | 5 | 1 of 20 | 0.31% | 0 / 0 | 284 / 1,061 |
  | 150 | 8 | 0 of 20 | 0.00% | 1 / 1 | 820 / 1,817 |

### Next, most valuable first

1. Route elimination for the C2 losses (empty the shortest route, reinsert with a penalty), then PyVRP on the same files
   and time budget as the fair comparison; Gehring & Homberger 200 to 1,000 customers.
2. The tool's objective inside the engine (elapsed time and the longest day, not drive time alone), so it wins on
   balanced multi-driver days too; and a Web Worker so a 150-stop plan does not hold the page.
3. Driver shifts and breaks, pickup-and-delivery pairs, and road-network times from a deployer's own OSRM or Valhalla
   (an env var, off by default).
4. Recurring routes: first version landed 2026-11-24 as the weekly planner (below).

## Weekly route planner (2026-11-24)

**Page:** [`weekly.html`](weekly.html) (https://marisstella.app/route-stop-optimizer/weekly.html). For routes that
serve the same customers every week (pool service, lawn care, pest control, cleaning, meter reading): paste
`name, lat, lng, service minutes, visits a week, allowed days, current days`, and it chooses **which day(s) each customer is
served** and **every day's routes** for your drivers within a shift, then shows what that saves against the days the
customers have now (both weeks routed by the same engine) and lists the customers to move.

- **Why someone would use it:** recurring-route planning is what paid field-service and route tools sell per vehicle
  (route optimisation add-ons in pool and lawn software, OptimoRoute's and Route4Me's territory and recurring-route
  features); the free alternatives are a spreadsheet, a wall map and pie slices by hand. This is free, private, needs
  no account, handles twice- and three-times-weekly customers with spread patterns, and charges a per-move cost so it
  does not reshuffle the whole book to save a minute.
- **Engine (`weekly.mjs`):** periodic vehicle routing by ruin and recreate with simulated annealing; visit patterns
  spread across the week (two a week = Mon+Thu, Mon+Fri or Tue+Fri on five days); shift overtime charged at 100
  driving minutes per minute, ramped up from 0.1 during the search; 2-opt on touched routes.
- **Measured** ([eval/weekly-2026-11-24.md](eval/weekly-2026-11-24.md)): 85 of 85 small weeks equal the enumerated
  optimum; on invented books of 40 / 80 / 150 customers, 43% / 40% / 35% less weekly drive time than days dealt out
  as books grow, 26% / 21% / 12% less than pie-slice zoning, no overtime left. Five seeds land within 2 to 4%.
- **Limits:** no road network, no in-day time windows, no driver consistency, no every-other-week customers; a
  150-customer, 3-driver week takes about 2 s per plan in Node and holds the tab while it runs.

### Weekly planner, next

1. A published PVRP benchmark (Cordeau-Gendreau-Laporte p01-p32 with their best-known values) once a host serves the
   files, and an exchange move for tight shifts (the 2 to 4% seed spread).
2. Every-other-week customers (a 10-working-day cycle), and keeping a customer with the same driver.
3. Run the search in a Web Worker so a 300-customer book does not hold the page.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. FSL-1.1-MIT licensed.
