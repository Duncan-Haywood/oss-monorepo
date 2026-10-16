# Crew Dispatch Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/crew-dispatch-optimizer/>

A free browser tool for plumbers, HVAC, electricians, cleaners, landscapers and any small service business that sends
crews to jobs: **paste today's jobs and your crews, and get which crew takes each job and the order of each crew's
stops at the lowest cost**, respecting skills, hours in the day and what each job is worth. Nothing is uploaded.

After using this, you can now **see what sending each job to the nearest crew costs you, which crew the day depends on,
and what happens when jobs run long**, which used to be a dispatcher's gut feel.

## Model

- Jobs: `name, lat, lon, hours, skill (optional), value (optional)`. Crews: `name, lat, lon, hours available,
  hourly cost (optional), skills (optional)`. Skills separated by `|` or `/`. Numbers outside latitude/longitude range
  are read as miles on a grid.
- Cost of a crew's day = hourly cost x (work hours + driving hours) + cost per mile x miles. Driving hours = road miles
  / speed; road miles = great-circle (or grid) distance x a road factor. A day must fit the crew's hours and skills.
- Objective: total crew cost plus the value of any job left unplanned (a job with no value is always planned if it fits).
- **Exact for up to 12 jobs**: Held-Karp gives the cheapest order of every job subset for every crew; a subset DP across
  crews picks the best split. Tests compare it with brute-force enumeration.
- More jobs: seeded multi-start cheapest insertion plus relocate, swap and 2-opt local search. Deterministic. Tests
  compare it with the exact solver (under 3% gap on random instances) and assert it never loses to the nearest-crew
  baseline.
- Compared with: each job to the nearest skilled crew, in listed order and in the best order. Sensitivity: each crew
  out, one extra crew, every job 10-30% longer.

## Limits

Not modelled: time windows, live traffic, breaks, overtime, job priorities beyond dollar value, parts, the individual
technician, multi-day plans. Drive times are straight-line estimates with a road factor, not routed distances. Verified
only against brute force and invented data. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
