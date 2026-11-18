# Venture suites: wall-framing-takeoff's schedule keeps its working-day calendar (2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run timed the flagship suites file by file
instead.

## Reading

`node --test <file>`, one file at a time, this container (4 cores), wall time:

| venture | slowest files |
|---|---|
| sales-agent, einvoice-preflight (227 files, 50 s in all) | none above 1.4 s |
| ai-bookkeeper | `fuzz` 4.2 s, `import-order-property` 3.3 s |
| wall-framing-takeoff | `engine` 6.8 s, **`risk-fuzz` 6.4 s**, `cli-sweep` 5.0 s |

`risk-fuzz` was the target. It runs about 60,000 Monte Carlo schedules of 1 to 8
activities, roughly 100 µs each, which is slow for that size.

## Profile

`node --cpu-prof` on the test file, self time: `isWork` 4.3 s, `dateOf` 0.8 s,
`schedule` 0.2 s, `toIndex` 0.2 s. So 80% of the time was the calendar walk.
`schedule()` turned each row's start and finish index into a date with
`dateOf(start, n)`, which walks day by day from the start date. Each step called
`isWork`, which built an ISO string with `toISOString().slice(0, 10)` to look the
day up in the holiday set, even when the set was empty. The cash-flow loops call
`date(i)` for every working day of every costed activity, so the cost is
quadratic in the schedule's length.

A second, latent cost in `risk.mjs`: the standard deviation recomputed the sum
of all finishes inside its own `reduce`, which is runs² additions (4×10⁸ at the
allowed maximum of 20,000 runs).

## Change

- `schedule.mjs`: `date(n)` reads a working-day calendar that `schedule()`
  extends on demand. Whole n ≥ 0 come from the memo. Anything else, such as
  `undefined` or a fraction, still goes through `dateOf`, so its answer is unchanged.
- `isWork` looks the day up in a set of UTC-midnight timestamps instead of ISO
  strings. Every date `schedule()` walks is a UTC midnight: start, holidays,
  deadline, notBefore and crewOff are all parsed as `YYYY-MM-DD` + `T00:00:00Z`,
  and the first four pass `realDay`. `dateOf` is private to the module, so no
  outside caller passes a string set.
- `weekOf` in the cash-flow block is memoised per date.
- `risk.mjs`: the mean is taken once before the standard deviation.

## Verification

- **Same answers.** A scratch script ran HEAD's `schedule.mjs` and `risk.mjs`
  against the new ones on 4,000 random schedules. They covered holidays, weather
  days, `weatherLoss`, `weatherRate`, crews, `crewOff`, `notBefore`, lags,
  fractional days, deadlines, carry cost, slips, costs and draws, plus 400
  `scheduleRisk` runs at 200 draws each. All 4,400 JSON outputs were
  byte-identical (0 differences).
- `python3 platform/ci/run_venture_tests.py wall-framing-takeoff`: ok, 25.1 s.

## Numbers (before → after, same container, same commands)

| measure | before | after |
|---|---:|---:|
| `node --test risk-fuzz.test.mjs` | 6.4–6.8 s | 1.7–1.8 s (3 runs) |
| `node --test schedule-fuzz.test.mjs` | 0.39 s | 0.25 s |
| `scheduleRisk`, 40-activity serial house, 3 holidays, deadline, 1,000 runs (the CLI `--risk` and page default) | 16.5–16.7 s | 0.52–0.53 s |
| same, 20,000 runs (the maximum) | 322 s | 9.3 s |

Same P80 (324 working days) and sd in every pair. The 1,000-run row is what a
builder waits on with `node cli.mjs plan.json --risk` or in
`schedule-calculator.html` once their schedule has 40 activities with ranges:
about 17 seconds of a frozen page, now half a second.

## Not changed, ranked for the next run

1. `wall-framing-takeoff/engine.test.mjs` 6.8 s: not profiled this run.
2. `scheduleRisk` at 20,000 runs is still 9.3 s. What remains is `isWork` and
   `date`, because each run rebuilds the calendar. A calendar shared across runs
   (the start date and off days don't change between draws) would cut most of
   it, but it means passing a calendar into `schedule()`. Worth it only if
   someone actually runs 20,000.
3. `toIndex` (deadline, notBefore) and the `crewOff` loop still walk from the
   start. Each is one walk per schedule, about 1 s of the 9.3 s above.
4. ai-bookkeeper `fuzz.test.mjs` 4.2 s, `import-order-property` 3.3 s: unprofiled.
