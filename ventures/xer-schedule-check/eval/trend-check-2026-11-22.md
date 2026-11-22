# Schedule health trend against planted slips, 2026-11-22

**Question.** Over a series of P6 updates, does `trend.mjs` count missed tasks
and BEI against the first update correctly, and does its float-erosion list
name the work that really lost float, and only that?

**Data.** No public series of real consecutive P6 updates exists
(`compare-check-2026-11-19.md`). Each of the six public XER files from
`bash eval/corpus-fetch.sh DIR` is the first update of a series made by
`status.mjs`: statused as planned four times, 20 working days of the project
calendar apart.

**Method.** `node eval/trend-check.mjs DIR/xer --seeds 3 --json eval/trend-check-2026-11-22.json`
(output: `trend-check-2026-11-22.txt`; 67 s, 53 s of it the CCA file).

- Series A, as planned. Expected in every update: 0 missed tasks; BEI 1.000 or
  more (DCMA's BEI counts all finished work, so early finishes can lift it
  past 1) or no due work; no finish movement; no erosion row whose cause is
  the activity's own finish moving later.
- Series B, two 5-day slips planted in the second window: one on a
  driving-path activity under way or due in it, one on an off-path activity on
  the project calendar with more than 7 days of float, started by the second
  data date and still open at the last. Expected: the driving-path activity
  is in the missed list of a later update exactly when its baseline finish
  (its finish in the first file's run) is on or before that data date; the
  off-path activity is in the erosion list exactly when its float, measured
  from schedule runs of the first and last files, fell.

**Results.**

| File | A: missed by update | A: BEI vs first | single-file BEI (dcma.mjs) | A: eroding rows (cause) | B: path slip right | B: off-path right |
|---|---|---|---|---|---|---|
| CCA_R03 (hospital, P6 5.0) | 0/0/0/0/0 | 1/1/1/1/1.001 | 0.662/0.872/0.976/1.03/1.037 | 15 (late finish earlier) | 3/3 | 3/3 (float fell in 0) |
| Expressway_Project | 0/0/0/0/0 | -/1/1/1/1 | -/1/1/1/1 | 0 | 3/3 | no candidate |
| example_xer_file | 0/0/0/0/0 | 1/1/1/1/1 | 1/1.017/1/1/1 | 0 | 3/3 | 3/3 (fell in 0) |
| hotel-project | 0/0/0/0/0 | -/-/1/1/1 | -/-/1/1/1 | 4 (late finish earlier) | no candidate | 3/3 (fell in 3, by 5.0 days each) |
| sample | 0/0/0/0/0 | -/1/1/1/1 | -/1/1/1/1 | 0 | 3/3 | no candidate |
| terminal-building-airport | 0/0/0/0/0 | -/-/1/1/1 | -/-/1/1/1 | 0 | 3/3 | no candidate |

Totals: series A clean on 6 of 6 files; planted driving-path slips named
exactly when due 15 of 15; off-path slips listed exactly when their float fell
9 of 9 (it fell in 3, each by the 5 days typed; in the other 6 the slip cost
no float, the finish being held by an FF predecessor or a constraint, and the
activity was rightly not listed).

**What it shows beyond the pass.**

- The single-file BEI on the original CCA file is 0.662 and on the as-planned
  updates climbs to 1.037, while every one of those updates went exactly as the
  first planned. BEI against the first update reads 1.000 throughout. The
  single-file number tracks how P6 rewrote the planned dates, not delivery.
- Float falls with nothing late. 19 activities (15 CCA, 4 hotel) lose float
  in an as-planned series: each is under way and its successors are tied to
  its start (SS), so P6's late finish (successor's late start less the lag
  plus the remaining duration) pulls in as the remaining shrinks. Example:
  hotel HEMSSME1230, float 39, 39, 39, 34, 14 days with its early finish
  fixed at 2012-08-23. The trend lists these with the cause "late finish
  earlier" so a reader does not take them for slippage.

**Limits.** Synthetic series from real files, not real consecutive updates;
the slips are planted on remaining duration only. The fitted rate assumes
float keeps falling at the series' average pace.
