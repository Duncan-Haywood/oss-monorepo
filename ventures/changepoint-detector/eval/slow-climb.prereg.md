# Round 6: a slow-climb check beside the daily watch, on calm-noise shops (pre-registered 2026-11-21, before any round-6 shop ran)

## Why this round

Round 5 (`eval/shop-noise-parts.prereg.md`, output `eval/shop-noise-parts-sim.out.txt`) found that Quiet's catches of
x1.9 climbs over four to eight weeks follow its false-alert rate, and that calm Gaussian noise (sd 0.356) is the worst
case: 44 of 100 climbs heard at 0.36 false alerts per 100 checks. The hypothesis it left: the daily watch is not
hearing the climb as such, only single big days on the new level. A check built for slow climbs, run beside the daily
watch, might hear what it misses. Three candidates, all run on **weekly totals**, where a four-to-eight-week climb is
four to eight points and the weekday pattern and shut Saturdays are summed away:

- **QW**: the shipped watch (Quiet, `model: 'mean'`, default detector) on weekly totals, from week 11;
- **DW**: the drift watch (`detector: 'drift'`, "Wandering level") on weekly totals, from week 11 (it refuses a
  seasonal period, so it cannot run on the daily series);
- **S**: a weekly slope check. At the end of every week from week 30, `slopeBreaks` (`slope-breaks.mjs`, `critical:
  'auto'`, up to 3 knots, 15% trimming) runs on the log weekly totals so far. Each knot whose slope after is steeper
  than before (a climb starts) and that lies more than 2 weeks from every knot already alerted is an alert, dated to
  the start of the first week of the new slope and sent on the last day of the checked week.

They are compared with **Q**, the shipped daily default (Quiet, `--period 7`, from day 74), as in rounds 3 to 5.

## Simulation (`eval/slow-climb-sim.mjs`, seed 20261123, fixed now)

Round 5's shop (371 days from 2024-01-01, weekday factors Sun 0.6, Mon 1.2, Tue-Fri 1, Saturday shut, 5 single-day
closures, an AR(0.5) level wobble of sd 0.05) with `sd * N(0,1)` day noise, no wholesale days. Two noise levels,
**sd 0.2** and **sd 0.36**, each with 100 unchanged shops (**N**), 100 climbs to x1.3 (**R30**) and 100 to x1.9
(**R90**): a linear climb in the log level over 28 to 56 days, starting in days 200 to 300. 600 shops, drawn in the
order sd 0.2 N, R30, R90, then sd 0.36 N, R30, R90.

**Caught** (primary, every arm): an alert dated from 7 days before the climb to its end, and sent from the climb's
first day to 14 days after its end. Round 3's rule (sent no more than 14 days after the date it gives) is printed
beside it, descriptive only: a weekly check dates a slope to its first week and needs a few weeks to see it, so that
rule would score the shape of the arm rather than whether the owner hears the climb in time.

**False alerts**: alerts on N per 100 days watched (Q checks daily; the weekly arms count 7 days a weekly check).

## Bars

For an arm A among QW, DW, S:

- **G1 (the slow-climb check hears what the daily watch misses):** at sd 0.36, A catches at least Q + 15 of R30, and
  A's false alerts at sd 0.36 are at most 1.0 per 100 days.
- **G2 (at the calmer noise too):** at sd 0.2, A catches at least min(Q + 15, 90) of R30, and A's false alerts at sd 0.2
  are at most 1.0 per 100 days.
- **G3 (beside the daily watch, not instead):** at sd 0.36, shops caught by Q or A on R90 are at least Q + 10, and the
  two together send at most Q's false alerts + 1.0 per 100 days.

## What follows

An arm that passes G1, G2 and G3 ships as an opt-in check beside the daily watch (if more than one does, the one with
most R30 catches at sd 0.36). If none passes all three, nothing ships and the README says which bar each arm failed.
Descriptive (no bar): catches by Q or A on R30, false alerts of the union, and median delays from the climb's first day.
