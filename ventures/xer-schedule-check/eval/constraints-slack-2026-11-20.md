# "Past late start" read again: calendar slack and missed deadlines, 2026-11-20

**Question.** The constraints log flags a row "past late start" when its
expected date is after the activity's late start. `eval/constraints-check-2026-11-20.md`
found 19 rows (of 56 run alone) that pass the late start and still move
nothing: 2 on the hotel file and 17 on CCA. A flag that cries wolf on a
third of the rows is one a superintendent learns to ignore. Can it say
which rows actually move something?

**Data.** The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md` (same
repos and commits, fetched for this check and not committed), logs planted
as in `eval/constraints-check.mjs` (seeds 1, 2 and 3; up to 40 rows a file in
the 3-week window).

**Method.** `node eval/constraints-check.mjs <dir> --seed N --json eval/constraints-slack-2026-11-20-sN.json`
(the check's section 4). Every row past P6's late start is run alone as
start floors (forward pass only) and checked for anything with a date to
keep: the project finish, and every activity whose own constraint bounds it
late (finish or start on or before, mandatory, "on"). A second probe puts
each row that is read as moving nothing **one working hour past** the late
start it was read against, and checks that something then moves.

## What changed in `constraints.mjs`

A link past P6's late start is now read against two more late starts,
computed once per log (two extra schedule runs, only when some row is past):

1. **Calendar slack** (`latestLoose`): the late dates with the slack P6's
   backward pass leaves out credited: a finish that may fall in its own
   calendar's non-work time (`calslack.mjs`) and milestones at the instant
   their logic gives (`milestones.mjs`). Not past this: **slackOnly**, the
   row moves nothing.
2. **Missed deadlines relaxed** (`latestRelaxed`): the same, with every
   finish- or start-on-or-before date the schedule already misses moved to
   where the schedule puts that activity. On negative float the late start
   comes from a deadline that a longer path misses by more; a row inside that
   margin adds nothing to the miss. Not past this: **alreadyBehind**.
3. Past both: **moves** (the finish or a deadline).

The page, the printable review and the text output say which, in words
(`pastLabel`); the summary counts `pastSlackOnly` and `pastAlreadyBehind`.

## Results (three seeds, 18 file runs, 65 rows past P6's late start)

| File | Past | Read "moves" | ... that move a kept date | Read slack only | ... that move one | Read already behind | ... that move one | An hour past the bound moves |
|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 26 | 1 | 1 | 0 | - | 25 | 0 | 19 / 19 |
| hotel (6.0) | 28 | 26 | 26 | 2 | 0 | 0 | - | 2 / 2 |
| sample (20.12) | 7 | 7 | 7 | 0 | - | 0 | - | - |
| Expressway (7.0) | 3 | 3 | 3 | 0 | - | 0 | - | - |
| terminal (5.0) | 1 | 1 | 1 | 0 | - | 0 | - | - |
| example (24.12) | 0 | | | | | | | |
| **Total** | **65** | **38** | **38** | **2** | **0** | **25** | **0** | **21 / 21** |

Every row the log now reads as moving something does; every row it reads as
moving nothing moves nothing; and each of those, an hour later, does (21 of
21 probed; the 6 rows naming two activities were not probed). So the
reading is sound on these files and tight to the hour.

- The two hotel rows are the ones `eval/calendar-slack-2026-11-20.md`
  traced: HEMSMCI0020 expected 2012-06-14, P6's late start 06-13 08:00, the
  late start with calendar slack 06-14 08:00.
- CCA carries negative float from three finish-on-or-before dates (552 open
  activities below zero). 25 of its 26 past rows are on paths that miss the
  deadline by less than the path that drives it, so the deadline is no later
  for them. Before this change all 25 read "past late start", the same words
  as the one row that does push the deadline out.

## Limits

- Logs are planted; no public job publishes its constraints log.
- "A date to keep" is the project finish and the file's own late-bounding
  constraints. A deadline kept outside the file (a contract milestone the
  schedule does not carry) is not seen.
- The relaxed run moves only finish- and start-on-or-before dates. A
  mandatory date that the schedule already misses still bounds the late
  dates as P6 does.
- Rows naming two activities are classified as a whole (moves if any link
  moves) and were not probed for tightness.
