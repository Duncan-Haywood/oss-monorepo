---
kind: note
topics: [redteam]
date: 2026-11-25
---
# Red team 2026-11-25: XER schedule check, as-planned statusing and redundant logic

Targets: `ventures/xer-schedule-check/redundant.mjs` and `status.mjs` (bet: construction; the schedule checker's redundant-logic report, and the as-planned update builder behind the example update series and the windows, collapse, EVM-series, trend and narrative evals). Neither file had been mutated by an earlier campaign.

- Campaigns: 16 mutants, 6 caught (37.5%). Of the 10 that escaped, 3 are equivalent (a sort comparator returning 2 for 1; two branches reachable only with `rem + slip <= 0`, i.e. a negative slip). The other 7 were gaps. With new tests all 13 non-equivalent mutants are caught (`redteam.py rerun`: `caught_after_fix` true on each).
- Real defect, patched with a failing test first: `statusAsPlanned` with a slip on an activity not yet reached by the data date marked it `TK_Active` with an actual start on the data date. Repro on the example file at 2026-05-06 with `slips: [{code: "A1150", hours: 16}]`: Paint got an actual start of 2026-05-06 against an early start of 2026-06-15, before its predecessors finished. That is out-of-sequence progress. Every eval filtered its slip candidates to `es < dd`, which worked around the bug without saying so. Now an unstarted activity stays unstarted, and the slip is added to its remaining and original durations, the same as `addDuration` in `eval/review-windows-check.mjs`.
- Guards added:
  1. `redundant.test.mjs`: 150 seeded random networks (FS/SS/FF/SF, leads and lags) compared with a brute-force longest path over the event graph, covering both lists, `sure` and `summary.share`. It catches the touched-reset leak between sources, which no fixed example reached. One more test covers a zero-lag link on a second calendar, which must not turn a lagged link into a "check".
  2. `status.test.mjs` (new): units, physical percent and cost moved for work under way, with and without a slip. It also checks total float is refreshed on every open activity, the input is left unchanged, and a sweep slips every open activity in turn and asserts no unstarted activity is started and the finish never comes in.

Next run: `crash.mjs` and `level.mjs` were each mutated once; `reldates.mjs`, `calslack.mjs` and `trend.mjs` never. A brute-force oracle like the one above suits `drag.mjs` and `floatpaths.mjs` too.
