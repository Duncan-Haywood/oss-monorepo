# Earned value by window across updates, 2026-11-20

**Question.** Over a series of P6 updates, does `evmseries.mjs` give each
window the earned value the work actually earned, against what the previous
update's own forecast promised, and does it name the activities that fell
short (or spent past what they earned) without naming others?

**Why this measure.** The usual period SPI divides earned value by planned
value from the baseline. P6 moves the planned dates of unstarted work with the
schedule, and many schedulers re-plan, so the baseline curve in a real export
drifts (on the hospital file, SPI 1.34 against SPI(t) 1.17 and a logic
forecast 9 months later: `eval/earned-value-2026-11-20.md`). The previous
update's forecast is the plan the contractor itself submitted for the period;
earned / promised says whether the period went as that update said, and the
tool reports it beside the baseline SPI rather than instead of it.

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched
for the check, not committed). Four carry cost on their assignments; the
terminal and `sample.xer` carry none and are reported as not loaded.

**Method.** `node eval/evm-series-check.mjs <dir> --json eval/evm-series-check-2026-11-20.json`
(20 plants of each kind, seed 1; `--n 50` for the second table). No public
file comes with its next update, so each series is built from the file with
`status.mjs`, which since today posts cost and units with the work (the share
of remaining work done in the period moves from remaining to actual on the
activity's units, physical percent and each assignment, at the planned rate):

1. update 1: the file as published;
2. update 2: update 1 statused exactly as planned, four weeks on;
3. update 3: update 2 statused four more weeks, with planted slips (40 extra
   remaining hours on activities the forecast works in the window) and planted
   overruns (cost spent x 1.5, no schedule effect) on other activities.

Checks: window 1 must read earned / promised 1.000 with nobody behind or ahead;
in window 2 every planted slip must be named "earned less than promised", and
every planted overrun "spent well past what it earned" (period CPI under 0.9);
any other activity named is counted. The first update's baseline planned value
at its own data date must equal `evm.mjs`'s planned value.

**Result (20 of each, seed 1).**

| File | Loaded activities | Window 1 earned / promised | W1 behind, ahead, costlier | Slips named | Others behind | Overruns named | Others costlier | Time |
|---|---|---|---|---|---|---|---|---|
| CCA (6.0, hospital) | 2,020 | 1.000 (EGP 50,742,356 of 50,742,356) | 0, 0, 0 | 20 / 20 | 0 | 20 / 20 | 0 | 11 s |
| example (24.12) | 285 | 1.000 (USD 236,005 of 236,005) | 0, 0, 0 | 20 / 20 | 0 | 16 / 16 | 0 | 0.3 s |
| hotel (6.0) | 1,112 | nothing worked in window 1 | 0, 0, 0 | 1 / 1 | 0 | 0 (none eligible) | 0 | 1.4 s |
| Expressway (7.0) | 21 | nothing worked in either window | 0, 0, 0 | 0 (none eligible) | 0 | 0 | 0 | 1.1 s |

The example file had only 16 activities left with remaining cost after the slips
were picked, so 16 overruns. Baseline planned value at the first data date
equals `evm.mjs`'s on all four (CCA EGP 330,091,169.72).

**Result (50 of each, seeds 1-5).** CCA: 250 of 250 slips and 250 of 250
overruns named, 0 others behind, 0 others costlier, window 1 1.000 on all five
seeds; window 2 earned / promised 0.973 to 0.993. Example: all 36 eligible
activities slipped on each seed, 36 of 36 named, window 2 0.706. Hotel: 1 of 1
on each seed. In all, 435 of 435 slips and 250 of 250 overruns. Summary for
seed 1 in `eval/evm-series-check-2026-11-20-n50.json`.

**A tolerance fixed on the way.** The first run named 18 of 20 slips on CCA and
19 of 20 on the example. The three missed were real, small shortfalls: an
activity 99.6% done whose last 8 h became 48 h earned 0.07% of its budget
instead of 0.4%, under the then threshold of 0.5% of the activity's budget. The
threshold is now 1% of what the activity was promised in the window (at least
one currency unit, or 0.1 h); window 1 still names nothing on any file, since
the as-planned rounding error is under 0.2 of a currency unit on 50 million.

**What this does not show.**

- The series are built by the same engine that forecasts the promise, so the
  1.000 of window 1 checks that the two agree (statusing, percent complete
  reading, cost posting), not that P6 would earn the same; P6's own earned
  value for a real next update was not available.
- The generator does not push a slipped activity's successors later, so "others
  behind: 0" says the tool names no innocent activity, not how it reads
  knock-on delay. On a real update, work held up by a late predecessor also
  earns less than promised, and is named; the windows analysis says whether
  that moved the finish.
- No public file carries a timephased baseline; the baseline here is the
  earliest update's planned dates, as the page says.
- Budget changes, earned value taken back, actuals reversed, added and removed
  activities are unit-tested (`evmseries.test.mjs`) and seen on the invented
  example series (March to April: the paint budget USD 7,600 to 6,080 and the
  removed final clean, USD -3,800 together), not on a real series.
