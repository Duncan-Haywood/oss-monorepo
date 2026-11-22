# Joint acceleration: checks (2026-11-22)

`crash.mjs` brings the forecast finish in step by step. At each step it takes
the driving network into the finish from this tool's P6 engine (`cpm.mjs`,
relationship float 0), builds an event graph on it (each activity a start and
a finish node joined by its duration; FS, SS, FF and SF links between the ends
they join), and finds the minimum cut by max flow: the cheapest set of
activities every driving chain passes through. The cut is shortened together
by the least working time that wins what the step can (bisection on 6-minute
steps, up to one project-calendar day), and the schedule is recomputed to
measure the gain. Shortened activities carry a lower bound on their duration
edge, so a later cut may give their time back and refund it (Phillips and
Dessouky 1977). A cut that wins nothing is retried at 2 to 5 times the step
within its room (calendar staircases), then set aside.

Why it exists: drag (`drag.mjs`, eval/drag-check-2026-11-22.md) is one
activity at a time, and on real files parallel chains of equal length make
it 0 for almost everything (terminal-building-airport: 33 longest-path
activities, one with drag; hotel-project: 130, two with drag).

## 1. Brute-force oracle (eval/crash-oracle.mjs, crash.test.mjs)

Random finish-to-start networks on whole working days (Mon-Fri 8-hour
calendar), each activity with a room of 0 to N days (never past its
duration) and a cost of 1 to 5 per day. The oracle enumerates every
combination of whole-day shortenings with its own longest-path recursion
(no shared code) and records the least cost of each gain. For each step the
tool takes, its cumulative cost is compared with the least cost of at least
that gain.

| Networks | Activities | Room (days) | Link density | Step points | At the optimum | Reached the oracle's most |
|---|---|---|---|---|---|---|
| 300 (in crash.test.mjs) | 4-7 | 0-2 | 1.6 | 1,078 | 1,078 | 300 |
| 1,000 | 6-9 | 0-2 | 3 | 5,983 | 5,983 | 1,000 |
| 300 | 6-8 | 0-4 | 3 | 2,949 | 2,949 | 300 |
| 300 | 5-8 | 0-3 | 2.5 | 2,115 | 2,115 | 300 |
| 200 | 8-9 | 0-3 | 4 | 2,087 | 2,087 | 200 |
| **2,100** | | | | **14,212** | **14,212** | **2,100** |

No random network needed time given back. A first oracle run reported 49
"misses"; they were the oracle's own fault (it let a 2-day activity lose 4
days, a negative duration) and went away when its room was capped at the
duration, as the tool's is.

Two faults the oracle found in the tool before that, both fixed:

- A zero-duration activity finishes at the next working day's start (08:00)
  while a parallel chain finishes at the previous day's end (17:00): the
  same working instant, different timestamps. `floatpaths.mjs` longestPath
  compares timestamps, so it kept only one chain and the cut missed the
  other (4 of 300 networks stopped short). The cut now takes every activity
  finishing on the forecast finish in working time.
- The "acceleration data names activities not in the project" warning
  counted activities that were simply not on the longest path.

## 2. Bridge networks (eval/crash-bridge.mjs)

A -> C, A -> E -> D, B -> D: the textbook shape where buying time on the
bridge E first and then cutting A + D makes E's time useless. 3,000 random
cases (durations 2-9 days, room 0-4, cost 1-9):

| | Step points | At the optimum | Worst over the optimum | Steps giving time back |
|---|---|---|---|---|
| With giving back (default) | 15,283 | 15,283 | 0 | 45 |
| Without (`giveBack: false`) | 15,283 | 15,214 | 19% | - |

The first case found: durations A 4, B 4, E 3, C 7, D 9; costs A 3, B 8, E 1,
C 9, D 5. Six days cost 21 without giving back and 20 with it (step 6: A + D
shortened, E given back, 3 + 5 - 1 = 7 for the day).

## 3. Six public P6 files (`node eval/crash-check.mjs DIR/xer 20`)

Files: `bash eval/corpus-fetch.sh DIR`. Default room (25% of each task's
remaining duration, cost 1 per working day, so cost = activity-days
shortened), target 20 working days. Replay: every shortening chosen, put into
one fresh schedule; its finish must equal the reported one. Results in
`crash-check-2026-11-22.json`.

| File | Finish | After | Won (d) | Best single drag (d) | Activity-days bought | Steps | Most at once | Shortened | Stopped | Reschedules | ms | Replay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CCA_R03 | 2013-06-22 | 2013-06-07 | 13 | 5.65 | 22.29 | 24 | 3 | 8 | no finite cut | 267 | 32,802 | same |
| Expressway | 2016-08-28 | 2016-08-08 | 20 | 5 | 250 | 14 | 23 | 25 | target | 137 | 748 | same |
| example_xer_file | 2027-05-06 | 2027-05-03 | 3.32 | 3.32 | 3.32 | 4 | 1 | 1 | no finite cut | 36 | 38 | same |
| hotel-project | 2014-07-23 | 2014-07-08 | 13.75 | 1 | 36.13 | 51 | 5 | 29 | no finite cut | 418 | 8,183 | same |
| sample | 2021-10-07 | 2021-09-09 | 20 | 5 | 20 | 32 | 1 | 16 | target | 256 | 40 | same |
| terminal-building-airport | 2013-02-27 | 2013-02-07 | 20 | 1 | 53.25 | 24 | 3 | 10 | target | 207 | 69 | same |

## What the files show

- **Parallel chains hide what can be won.** terminal-building-airport's best
  single activity wins 1 day; shortening two or three excavation and footing
  activities together wins 20 for 53 activity-days. hotel-project: 1 day by
  drag, 13.75 jointly.
- **Some finishes are expensive to move.** Expressway's 20 days need 23
  parallel fabrication activities (BEW/PR/FC/1040 to 1260) shortened together
  at every step: 250 activity-days for 20 days. A single-activity view
  (drag 5 days on BEW/MO/NC/1000) says nothing about that.
- **Calendar staircases are real.** Expressway's NC/1000 (45 h on a 9-hour
  calendar) wins nothing until it is 27 h shorter; the default room (11.25 h)
  never gets there, so it is set aside and the run says so. A first version
  set aside any cut that won nothing in one day; retrying at 2-5 days took
  Expressway from 0 to 20.
- **CCA stops at 13 days** because the next driving chains have nothing left
  to shorten within 25% (its warnings name the activities whose shortening
  won nothing: T12CO04403C0's staircase and reverse-drag neighbours, as in
  the drag check).

## Not checked

- No commercial crashing tool compared (none public for these files).
- Real acceleration rates: the public files carry no crash costs, so the
  file runs use the default room and unit cost. A contractor's real rates
  would change which cut is cheapest.
- The oracle covers finish-to-start networks on one calendar. SS/FF/SF links
  and lags: covered since 2026-11-22 by eval/crash-oracle-links.mjs
  (eval/crash-oracle-links-2026-11-22.md; it found two faults, now fixed).
  Mixed calendars are covered only by the replay check.
- The greedy steps are scored at whole-day gains; the optimum over
  fractional shortenings on several calendars is not proven.
