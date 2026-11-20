# Constraints log on six public P6 files (2026-11-20)

`node eval/constraints-check.mjs <files> --seed N --json eval/constraints-check-2026-11-20-sN.json`,
seeds 1, 2 and 3, on the six public XER files of eval/cpm-vs-p6-2026-11-19.md
(CCA_R03, Expressway_Project, example_xer_file, hotel-project, sample,
terminal-building-airport; same repos and commits). The hotel file's open
work starts after its data date, so its window starts at the date the
look-ahead names ("the next work starts ...").

No public job publishes its constraints log, so logs are planted: up to 40
not-started, unconstrained activities in each 3-week window get a row, with
an expected date 5 days before to 15 days after the activity's start, a fifth
cleared, a tenth with no date, every seventh row naming two activities.

## Results (three seeds, 18 file runs, 432 rows, 224 late)

| Check | Agree |
|---|---|
| What-if finish (log as start floors) = the same dates as P6 CS_MSOA constraints in the file, scheduled from scratch | 16 of 16 runs with a floor (2 runs had none) |
| Every open activity's early start and finish, the two routes | 59,334 of 59,334 |
| The look-ahead's "starts ... if the log holds" against the CS_MSOA route | 1,716 of 1,716 |
| Each row's own finish slip = that row alone as CS_MSOA constraints | 128 of 128 (first 10 rows per file run) |
| "late" exactly when the expected day is after the need-by day | 358 of 358 links |
| A late activity's start with the log on or after the expected date | 248 of 248 |

The first run of the check found 9 activities on the hotel file whose start
differed between the two routes: they are as-late-as-possible activities,
whose early dates come from the backward pass, and the what-if was running
the forward pass only. The what-if now runs the full schedule (each row
alone still runs the forward pass only, since ALAP work never moves the
project finish); after the change all agree.

## "Past late start" against "moves the finish"

Of the rows run alone, 37 pass their activity's late start and move the
finish, 0 move the finish without passing it, and 19 pass it without moving
the finish:

- 17 on CCA: the file carries negative float from interim date constraints
  (125 of the 422 not-started activities in the window), so a row that passes
  the late start breaks an interim deadline while the project finish holds.
  The flag is the one that matters there; a finish-only what-if hides it.
- 2 on hotel (seed 3): the file has no negative float and no deadline, yet
  P6's late dates (the engine's late dates equal P6's stored ones on this
  file) are tighter than what moves the finish. Probing HMMOAZ040 (only an FF
  successor, HMMOAZ000, tf 296 h): pushed one day past its late start, the
  project finish does not move. Traced 2026-11-20
  (eval/calendar-slack-2026-11-20.md): an FF 32 h lag on a 7-day curing
  calendar ends on the next activity's Friday off, and P6's backward pass
  does not credit that day; HMMOAZ040 has 304 h, not 296 h. (An earlier note
  here said six weeks past its late start also held; rerun, it moves the
  finish to 2014-09-03.)

So the page reports both: "past late start" from the late dates, and "moves
finish (d)" from the recomputed schedule.

## Limits

The statuses are checked against their own rules and the what-if against a
second route through the same engine, not against a site team's log or a
superintendent's reading; that needs a real job.
