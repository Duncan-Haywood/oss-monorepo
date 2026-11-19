# Risk register events on six real P6 files, 2026-11-19

**Question.** Do risk register events (`risk.mjs` `risks`: probability, a
triangular delay in working days, the activities hit) delay the schedule the
way the checked CPM engine does, and does adding a register leave the duration
draws alone so the "without the events" column is a clean comparison?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (same
repositories and commits: MutahirAbbas/xer-checker @ 2296ee1,
kaustumbh7/critpath-primavera-p6-checker @ ba6b5bf, ASHspace/PrimeveraXEREditor
@ 9cb4f23, Badr1600/p6-analyzer @ ec457f3), fetched for this check, not
committed. None carries a risk register.

**Method.** `node eval/risk-register-check.mjs <dir> --planted 40 --runs 300 --json eval/risk-register-check-2026-11-19.json`.

1. Planted events: up to 40 open, non-milestone activities per file picked by a
   seeded draw, each given a certain event (probability 1) with a fixed delay of
   1 to 40 working days and a zero-width duration range. Every run must give
   exactly the finish `cpm.mjs` gives with the same delay added to that activity
   directly (its `delay` option, the critical path test's code path). Separately:
   a delay shorter than the activity's total float should not move the finish.
2. Common random numbers: with the default range (90/100/125%), the register's
   "without the events" percentiles must equal a run with no register at all,
   same seed.
3. An illustrative register (not real risks): 30% / 5-10-20 days on the
   activity that starts the forecast's driving path, 15% / 10-15-30 days on the
   longest activity on it, 50% / 2-5-15 days on the off-path activity with the
   least positive float. 300 runs, seed 1.

**Result.**

| File | Planted exact | Delay < float, finish held | Without = no register | P80 without / with (days from data date) | Contingency at P80 | Time 300 runs, without / with register |
|---|---|---|---|---|---|---|
| CCA (6.0) | 40 / 40 | 33 / 33 | yes | 569.3 / 572.9 | +3.6 | 45.1 / 72.3 s |
| Expressway (7.0) | 40 / 40 | 39 / 39 | yes | 1,401.3 / 1,408.4 | +7.1 | 1.2 / 2.2 s |
| example (24.12) | 40 / 40 | 30 / 36 | yes | 236.8 / 242.3 | +5.5 | 0.24 / 0.42 s |
| hotel (6.0) | 40 / 40 | 31 / 31 | yes | 727.5 / 732.3 | +4.8 | 6.0 / 11.1 s |
| sample (20.12) | 15 / 15 | 0 / 0 | yes | 159.1 / 170.1 | +11.0 | 0.05 / 0.04 s |
| terminal (5.0) | 32 / 32 | 8 / 8 | yes | 325.0 / 332.7 | +7.7 | 0.05 / 0.08 s |
| **All** | **207 / 207** | **141 / 147** | **6 / 6** | | | |

(sample.xer has 30 open non-milestone activities and terminal 63; the draw
takes half of a small file's pool before 40.)

Event ranking in the illustrative register (finish shift = mean finish of runs
where the event happened minus runs where it did not, working days; ~ = within
two standard errors of noise):

| File | Path start, 30% | Longest on path, 15% | Near-critical, 50% (its float) |
|---|---|---|---|
| CCA | +6.9 | +13.4 (same activity as path start) | ~0.0 (2.9 d) |
| Expressway | +18.0 | ~+6.1 | ~-5.9 (32.9 d) |
| example | +8.0 | +13.6 | ~+0.7 (9.0 d) |
| hotel | +10.2 | ~+0.8 | ~+0.2 (1.0 d) |
| sample | +13.2 | +21.2 | (no off-path activity) |
| terminal | +9.3 | +16.6 | ~-0.1 (1.0 d) |

**What it says.**

- Events go through the same engine: all 207 planted certain events give, in
  every run, the finish to the minute that the CPM engine gives with the same
  delay applied directly. The engine matches P6's own dates on 19,820 of 19,822
  activities (`eval/cpm-vs-p6-2026-11-19.md`).
- The six example-file delays shorter than total float that still moved the
  forecast finish are the file, not the engine: that project has a must-finish
  date 10 calendar days after its forecast finish, so total float is measured
  against the must-finish date (as P6 does) and includes that margin. All six
  moved the forecast by 0.6 to 7.9 calendar days and none past the must-finish date.
  Total float is "slack to the latest allowed finish", not "slack to the
  forecast", whenever a must-finish date is later than the forecast.
- A register never disturbs the duration draws: on all six files the
  "without" column equals a no-register run exactly, so the contingency column
  is the events' own effect, not sampling noise between two runs.
- The ranking says what a register review should: an event on the driving
  path's first activity moves the finish by most of its delay when it occurs;
  an event on an activity with a few days of float mostly does not. Two cases
  show why a ranking needs the noise mark: on the Expressway file (23 activities
  of 1,095 days, `eval/risk-check-2026-11-19.md`) the spread is so wide that
  even a 15% event of 10-30 days on the path cannot be told apart from noise
  in 300 runs, and its near-critical event reads -5.9 days, which is noise
  (32.9 days of float against a 2-15 day delay can move nothing).
- Cost: with a register each run that has an event schedules twice, so a
  run takes up to twice as long (CCA 45 to 72 s for 300 runs in Node).

**Limits.** The register here is illustrative: the files carry no real risks,
so the contingency figures are examples of the output, not forecasts. Delays
are converted to minutes at the activity calendar's hours per day, or 8 where
the calendar does not state one (true of the 24.12 file's calendars), the same
fallback the per-activity ranges use. Probabilistic branches (an event that adds
activities) and correlation between events are not modelled.
