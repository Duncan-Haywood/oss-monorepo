# Monte Carlo finish-date risk on six real P6 files, 2026-11-19

**Question.** Does `risk.mjs` sample the same schedule the engine computes, and
what does a default-range risk run say about real files that one CPM date does
not?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (same
sources and commits, fetched for this check, not committed).

**Method.** `node eval/risk-check.mjs <dir> --runs 500 --json eval/risk-check-2026-11-19.json`.
Per file: a zero-width range (every draw equals the file's remaining duration),
then the default range (triangular 90 / 100 / 125% of each open activity's
remaining duration) with independent draws and with correlation 0.3, seed 1.
"Near-critical" = on the driving path in at least 10% of runs but not on the
forecast's own driving path.

**Result.** P-values are working days past the recomputed CPM finish.

| File | Varied | CPM finish (days from data date) | Zero-width = CPM | P50 / P80 (rho 0) | P50 / P80 (rho 0.3) | Chance of CPM date (rho 0 / 0.3) | Ever critical | On forecast path | Near-critical | Time (500 runs) |
|---|---|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 13,653 | 524 | yes | +38.9 / +45.9 | +34.6 / +52.1 | 0% / 5.2% | 412 | 22 | 47 | 70 s |
| Expressway (7.0) | 821 | 1,154 | yes | +223.5 / +245.4 | +206.2 / +239.7 | 0% / 0% | 30 | 5 | 0 | 2.4 s |
| hotel (6.0) | 3,973 | 662 | yes | +55.0 / +66.0 | +51.9 / +72.7 | 0% / 2.4% | 774 | 79 | 76 | 8.4 s |
| terminal (5.0) | 63 | 303 | yes | +18.4 / +22.2 | +17.1 / +28.0 | 0% / 7.2% | 46 | 16 | 29 | 0.1 s |
| example (24.12) | 365 | 213 | yes | +14.6 / +23.8 | +15.0 / +25.0 | 0% / 8.4% | 96 | 13 | 15 | 0.4 s |
| sample (20.12) | 30 | 150 | yes | +7.3 / +9.1 | +6.8 / +12.3 | 0% / 12.4% | 30 | 30 | 0 | <0.1 s |

**What it says.**

- The sampled engine is the checked one: on all six files the zero-width run
  gives the recomputed CPM finish to the minute in every run (that finish
  matches P6's on 99.9% of activities).
- The default range is skewed (mean 105% of the file's duration), so on a
  single chain (sample.xer, one 30-activity path) P50 lands about 5% of the
  path late: +7.3 days on 150. Files with many parallel paths land later than
  that skew alone: the hotel file's P50 is +55 days on 662 (8.3%), the
  Expressway file's +224 on 1,154 (19.4%). That excess is merge bias: the
  finish waits for the latest of several uncertain paths.
- The Expressway result is a modelling finding, not a forecast: 23 open
  activities of exactly 1,095 days each ("Maintenance of Engg Off Type 1",
  "Provision of Survey Equipments" and the like) are modelled as ordinary
  tasks, not level of effort, and run in parallel to the finish. Any range on
  them makes the finish the latest of up to 23 draws of a three-year duration. A reviewer would ask for them to be level of effort,
  which the criticality list makes visible (30 activities ever critical, 5 on
  the forecast path).
- Near-critical work the single driving path hides: 47 activities on the CCA
  programme and 76 on the hotel drive the finish in 10% or more of runs without
  being on the forecast's driving path.
- Correlation 0.3 widens P10 to P90 on every file (CCA 19 to 54 days; terminal
  12 to 32), as one shared cause should.
- Sensitivity on the 821-activity Expressway file at 200 runs showed 0.22 on
  activities never on the driving path: chance correlations over many
  activities. Sensitivities below 4 / sqrt(runs) are now reported as blank.

**What this does not show.** Whether the default range is right for any of
these projects (it is a placeholder the page says to replace), or how the
P-dates compare with the projects' real finishes (none of the files is paired
with an as-built). Risk events, resource limits and probabilistic branches are
not modelled.
