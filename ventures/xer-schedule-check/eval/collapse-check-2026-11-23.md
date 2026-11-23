# Collapsed as-built check, 2026-11-23

`node eval/collapse-check.mjs <xer dir> --plants 10 --seed 2 --json eval/collapse-check-2026-11-23.json`
on the six public XERs of `eval/corpus-fetch.sh` (P6 5.0 to 24.12, 21,422 activities). What each
check means is in the script's header.

| File | As exported (on dates) | Finished as planned: model | Null collapse | Planted slips | Planted waits | XER round trip |
|---|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | 15,831 / 15,849 | 15,831 / 15,849, finish matches | ok | 10/10 | 10/10 | 10/10 |
| Expressway_Project | 823 / 823 | 823 / 823 | ok | 10/10 | 10/10 | 10/10 |
| example_xer_file | 425 / 425 | 425 / 425 | ok | 10/10 | 10/10 | 10/10 |
| hotel-project | 4,217 / 4,217 | 4,217 / 4,217 | ok | 10/10 | 10/10 | 10/10 |
| sample | 42 / 42 | 42 / 42 | ok | 10/10 | 10/10 | 10/10 |
| terminal-building-airport | 66 / 66 | 66 / 66 | ok | 10/10 | 10/10 | 10/10 |
| **Total** | **21,404 / 21,422**, 6/6 finishes | 21,404 / 21,422, 6/6 finishes | 6/6 | **60/60** | **60/60** | 60/60 |

33 of the 60 slips and 25 of the 60 waits moved the finish; the rest must leave it where it is,
and did. Seed 1 on the five smaller files: 50/50, 50/50, 50/50.

## What the misses taught (seed 1, before the fixes)

The first seed-1 run got 26 of 30 slips. Each miss became a rule in `collapse.mjs`:

1. **Expressway, Sunday-to-Thursday successor after a six-day predecessor:** the Saturday counted
   as wait. The gap is now the smallest lag that still lands the start (time the successor's
   calendar cannot work snaps forward anyway).
2. **Hotel, SS+60 d / FF+60 d pairs:** a slip upstream stretched the successor's actual duration.
   An activity whose finish an FF/SF link held keeps its planned duration, but only when a start
   link also holds its start; without that condition the CCA file as exported landed only 12,441
   of 15,849 (starts drifted later), with it 15,831.
3. **Hotel, 20 as-late-as-possible activities:** links out of them always look tight. Their early
   dates are worked out in logic order and successors' gaps read from those, as P6's forward pass
   schedules them.
4. **The example's inspection fixed for 2026-05-18 (a unit test):** dropping the constraint let a
   collapse slide it earlier than the city allowed. Start constraints dated on or before the
   actual start are kept as start-on-or-after; when the date is what held the activity, `gap`
   moves the date.

The reproduction count also compares by working time: a finish at 17:00 and the next midnight on
an 8-hour calendar are the same instant (CCA: most of the 3,408 early "misses" were this).

## The 18 CCA activities off their dates

16 of the 18 are the first miss on their chain (no predecessor missed): 12 have an FF-held
finish (8 in progress, 4 finished), 3 are as-late-as-possible activities with remaining work,
1 is in progress with neither. The project finish still matches. The first five are in the JSON
(`asExported.firstMisses`).

## Limits

Planted delays were made by the tool's own statusing (status.mjs), so this checks the model
against itself on a known answer, not against a consultant's collapse of a real claim. Next: a
real final update with a claim's delay list.
