# Critical path drag: checks (2026-11-22)

`drag.mjs` computes Devaux's critical path drag by rescheduling: each open
activity on the longest path (`floatpaths.mjs` `longestPath`) gets remaining
duration 0, the project is rescheduled forward with `cpm.mjs`, and the drag is
the forecast finish now minus the finish then, in working hours on the project
calendar. Lags between longest-path activities are set to 0 the same way. For
each activity with positive drag, a bisection (6-minute steps) finds the least
shortening that wins the whole drag (`shortenForHours`).

## 1. Independent oracle (drag.test.mjs)

200 seeded random finish-to-start networks of 6 to 30 activities, whole-day
durations (1-9 days) on a Monday-to-Friday 8-hour calendar. The oracle is a
ten-line longest-path recursion that shares no code with `cpm.mjs`: drag(k) =
L - L(with k at zero). For **2,477 of 2,477** activities the tool's drag
equals the oracle's (1,341 with positive drag, 314 of them capped below their
duration by a parallel path), and for every positive one `shortenForHours`
equals the drag. Plus hand cases: Devaux's two-path case (drag 15 d capped by
a 15-day float; cost per calendar day), reverse drag (FF in, SS out: -6 d), and
a cure lag (6 d of lag drag).

## 2. Six public P6 files (`node eval/drag-check.mjs DIR/xer`)

Files: `bash eval/corpus-fetch.sh DIR`. Results in `drag-check-2026-11-22.json`.

| File | Longest-path activities | With drag | Reverse | Limited by a parallel path | Lags with drag | Reschedules | ms |
|---|---|---|---|---|---|---|---|
| CCA_R03 (19,822 activities) | 54 | 4 | 2 | 2 | 3 | 105 | 11,704 |
| Expressway | 31 | 1 | 0 | 0 | 0 | 41 | 167 |
| example_xer_file | 13 | 12 | 0 | 9 | 3 | 113 | 149 |
| hotel-project | 130 | 2 | 2 | 0 | 0 | 160 | 1,714 |
| sample | 30 | 30 | 0 | 0 | 0 | 330 | 20 |
| terminal-building-airport | 33 | 1 | 0 | 1 | 0 | 51 | 10 |

Consistency check the analysis itself does not use: shorten each activity by
exactly its drag and the finish must come in by exactly the drag. **47 of 50**
positive-drag activities do. The three others:

- example_xer_file A10210: the project uses expected finish dates and A10210
  has one, so any shorter remaining duration is overridden; only zero (a
  milestone) skips it. The tool now notes this on the row ("its expected
  finish sets the duration").
- CCA BAFTS01801G0: on a 7-day calendar, the project calendar is 6-day; its
  45.2 project-calendar hours of drag take 53.2 of its own hours.
- CCA T12CO04403C0: the gain is a staircase. Shortening it by 4 h wins 4 h,
  by 8-14.7 h wins 8 h, by 20 h wins 12 h, and from 22.8 h (bisection) the
  whole 14.7 h. Its successor T12CO04405C0 is linked FF+112 h and is itself a
  reverse-drag activity. The row says how much shortening wins the drag.

Where drag is below the remaining duration, shortening by drag + 1 h never
gains more than the drag (12 of 12).

## What the files show

- **Equal parallel paths hide behind float.** terminal-building-airport has
  33 longest-path activities and only one with drag (1 d): parallel chains of
  equal length run beside the rest, so shortening any one alone wins nothing.
  hotel-project: 130 on the longest path, 2 with drag (its 1-day start and
  finish activities).
- **Reverse drag is real in practice.** hotel-project HEPSS00010/20
  (FF+600 h in, SS+408 h out): taking either to zero moves the finish 111-117
  working days later. CCA TEXCO04405C0 and T12CO04405C0 the same way.
- **Total float does not find the candidates.** CCA's longest path sits at
  +72 h of total float while 5 activities have -664 h (a must-finish date on
  another chain); a float threshold would test 545 activities and miss the
  longest path. The tool tests the longest path instead.

## Not checked

No commercial drag calculation was compared (Spider Project computes drag;
none of its outputs is public for these files). P6 does not store drag.
Drag is one activity at a time; joint acceleration of several is not
computed.
