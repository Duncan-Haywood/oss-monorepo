# Progress review on the public P6 files, 2026-11-23

`progress.mjs` (`node cli.mjs file.xer --progress`, the page's **Review progress**): does the
progress an update reports hang together with its own dates? Reproduce:

    bash eval/corpus-fetch.sh DIR && node eval/progress-check.mjs DIR/xer --plants 40 --seed 1 --json eval/progress-review-2026-11-23.json

## As published

| File | Activities (phys / units / duration %) | In progress | Flagged | By kind |
|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | 15,849 (281 / 15,349 / 219) | 2,495 | 1,855 | optimistic 1,628, overrun 1,434, zero remaining 62, overclaimed 2 |
| example_xer_file | 425 (425 / 0 / 0) | 21 | 15 | optimistic 7, stalled 8, overrun 2 |
| Expressway_Project, hotel-project, sample, terminal-building-airport | 5,167 | 0 | 0 | (no work in progress: nothing to read) |

The hospital file (CCA, data date 2011-09-30) is a job running late, and the review says how: of
its 2,495 activities in progress, 1,628 carry a remaining duration shorter than a straight line
at their own units pace (median: 40% done in 72 working days, 30 days left in the schedule
against about 102 at that pace, so 72 working days early), and 1,434 are now forecast at a median
2.5 times their original duration. All 1,628 are units-percent activities, where the percent comes
from the resource units and the remaining duration is kept by hand: the two had drifted. 62
activities are in progress with no remaining duration (P6 finishes them at the data date; an
actual finish was most likely forgotten). Two (UV09GZ26015R2, UV09GZ28006R2) claim 70% by units
37% of the way through their time.

A straight line is a reviewer's first reading, not a forecast: an activity that stopped and
restarts (CCA's restart dates run months past the data date on some) has a pace the line
understates. The list is what to ask the scheduler about, ranked by size.

## Planted

In a copy of each file with a data date, 40 activities the review did not flag got one defect
each, kind at random (the TASK row fields an update would carry; `eval/progress-check.mjs` header
lists them). Seed 1: 230 of 230 named with their kind (overclaimed 32, optimistic 32, stalled 29,
zero remaining 28, 100% not finished 29, progress on unstarted 33, finished short 47), and no
activity that was not planted gained or lost a flag. Seeds 2 and 3: 230 of 230 each, 0 changed.

The plants use the same rules the code does, so they check the reading of real rows, calendars
and data dates (working days spent on each activity's own calendar), not the rules' worth. That
needs a reviewer's list from a real pay application.

## Not yet

- A real owner's reviewer's list on the same update, to set the thresholds (30 points, 1.5 times,
  5 working days) from practice instead of convention.
- Activity steps (TASKPROC): with "percent complete based on steps" on, P6 sets physical % from
  the steps' weights; none of the public files has a step (0 TASKPROC rows in 21 files), so a
  steps-versus-physical check waits for one.
- In the written review and the update comparison (per update, the flags that are new this
  month).
