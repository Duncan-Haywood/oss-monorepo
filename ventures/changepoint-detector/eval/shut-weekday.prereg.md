# A shop shut one weekday: revenue's slow climb (pre-registered 2026-11-19, before the treatment ran on the fresh year or the simulation)

## The problem

README "A real shop's daily series": on the UCI Online Retail shop (2010-12 to 2011-12, the **design year**), Quiet and
Middle never alerted on daily revenue while it climbed from about £26k to £50k a day (September to November). Only
Eager heard it. The shop never trades on Saturdays, so one row in seven is a 0 that is part of the week, not news.

## What was looked at before writing this (exploration, design year only)

`eval/_explore.mjs`-style runs on the design year's revenue, Quiet (bocpd-ar1-window), default options:
with every always-zero Saturday left out, Quiet sends 2 alerts in 257 checks, one dated 2011-09-15 and sent
2011-09-21 (the build-up); with `--period 6` on the kept rows the same two (the March one later). `--log` on the
trading days gave 0 alerts at every setting (it shrinks the climb against the spread), and dropping every zero day
(bank holidays too) behaved like dropping Saturdays only. Middle stays deaf after the drop (0 alerts).

On the **fresh year** (Online Retail II, 2009-12-01 to 2010-12-09, `data/online-retail-2009-daily.csv`) the default
arm has been seen before: `eval/closed-days.out.txt` printed Quiet's revenue alerts with `--period 7`: one, dated
2010-09-28 but sent 2010-11-26 (59 days late). The treatment arm has not run on it.

## The rule (fixed now)

`dropShutWeekdays` (watch-core.mjs): when the labels are consecutive calendar days, a weekday whose value is 0 on
every one of at least 4 occurrences is left out of the series before a level model (`mean`, `meanvar`) reads it.
Labels stay the kept rows' dates. With `--period 7` given, the cycle after the drop is `7 - k` rows (k weekdays left
out). Count models (`poisson`) are untouched. Bank-holiday zeros (a weekday the shop usually opens) are kept.

Arms, Quiet only (the setting that was deaf): **D** the default, `--period 7`; **T** the rule, with period 7 - k.

## Bars

- **F1 (fresh year, hears it):** arm T sends a revenue alert dated 2010-08-15 to 2010-11-30 within 14 days of its
  date.
- **F2 (fresh year, stays quiet):** arm T sends at most 2 revenue alerts per 100 checks.
- **F3 (simulation, no change):** on 100 synthetic shops with no step, arm T's false alerts are at most 2 per 100
  checks in total.
- **F4 (simulation, power):** on 100 synthetic shops with a +30% revenue step, arm T catches (an alert within 14 days
  after the step, dated within 7 days of it) at least 60, and at least 15 more than arm D.

The simulation (`eval/shut-weekday-sim.mjs`, seed 20261119, fixed now): 371 days from a Monday; Saturdays 0; other days
`level * weekday factor * lognormal(0, 0.35)`, weekday factors Sun 0.6, Mon 1.2, Tue to Fri 1.0; the log level wanders
as AR(1) (rho 0.5, sd 0.05) around a constant; 3% of trading days carry a wholesale order (x 4); 5 random one-day
weekday closures (0). Step shops: level x 1.3 from a day drawn uniformly in days 200 to 340. Watch from day 74 (20%).

All four must pass for the rule to ship on the CLI and the page. Whatever happens, the result is written up.
