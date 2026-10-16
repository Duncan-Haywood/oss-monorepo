# HOS Trip Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hos-trip-planner/>

A free browser tool for truckers, owner-operators and dispatchers: **enter the hours-of-service clocks you have left and
the stops on a load, and see the schedule the rules force — drive blocks, 30-minute breaks, 10-hour resets, 34-hour
restarts — and the real arrival time at each stop.** Nothing is uploaded.

After using this, you can now **tell a broker whether a load makes its appointment, and where your reset will land**,
which used to be a mental sum of 11, 14, 8 and 70.

## Use

1. Open `index.html`, enter your clocks, one leg per line (`miles, mph, dwell hours, label`), click Plan the trip.
2. Pure logic is in `calc.mjs` (`plan()`); tests: `node --test`.

Modelled: 11-hour driving limit, 14-hour window, 30-minute break after 8 hours of driving (a 30+ minute dwell counts),
10-hour reset, 60/70-hour cycle with an optional 34-hour restart (49 CFR 395.3).
Not modelled: sleeper-berth splits, adverse driving conditions, exemptions, state/Canadian rules, days rolling off the
cycle. Not a logbook or ELD, and not legal advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
