# P6 resource curves in the planned spread, 2026-11-21

**Question.** Until today earned value (`evm.mjs`) spread every assignment's
budget evenly over the working time of its planned dates. P6 lets an
assignment follow a resource curve instead (`TASKRSRC.curv_id`, the curve in
`RSRCCURVDATA`). How many assignments in the public files do, and how far does
spreading them by their curve move the planned S-curve?

**Reading.** A curve has 21 values, `pct_usage_0` to `pct_usage_20`, one per
5% point of the duration. `curves.mjs` reads the twenty after the first as
the share of units in each twentieth of the assignment's working time (the
slice ending at that point), scaled to sum to 100, with any `pct_usage_0`
added to the first slice. That is MPXJ's reading (its `WorkContour.FLAT` is 0
then twenty 5s), and every curve P6 ships fits it: all start at 0 and the
twenty slices sum to 100 (Linear 20 x 5; Back Loaded 10 x 3.5 then 10 x 6.5;
Bell Shaped 0.5 ... 11.5 ... 0.5). Slices are cut by working time on the
activity's calendar, so a weekend inside the span takes none.

What uses the curve: planned value (to the data date, and the S-curve), the
planned value at other dates that a series of updates holds as its baseline
(`pvCuts`, `evmseries.mjs`), and the forecast of an assignment's remaining
while nothing is spent on it. Once actuals are booked the remaining is spread
evenly, because how P6 re-fits a curve to remaining units is not known here.

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched,
not committed).

**Method.** `node eval/resource-curves.mjs <dir> --json eval/resource-curves-2026-11-21.json`:
each curved assignment's budgeted hours spread both ways on its own calendar
and planned dates, summed by day, compared at month ends.

**Result.**

| File | Curves carried | Assignments naming one | Curve found |
|---|---|---|---|
| CCA (6.0, hospital) | 6 | 37 of 36,808 | 36 |
| Expressway (7.0) | 0 | 2 of 3,519 | 0 |
| example (24.12 Web) | 0 (empty table) | 234 of 1,677 | 0 |
| hotel, terminal, sample | 0 | 0 | - |

- CCA's curves: Back Loaded (7 assignments), Bell Shaped (1), Front Loaded
  (1), Linear (1), Triangular Increase (1) and a custom "PCO119" (25), a
  late bell peaking at slices 14-15.
- On all 36 spreads the daily parts sum to the budget (36 of 36), and Linear
  gives the even spread to 10^-6 h (1 of 1; the unit tests check it to the
  cent on cost).
- The curved work (834,430 budgeted hours) runs behind the even spread from
  the first month to the last; the largest gap is **109,048 h at 2012-03-31**:
  161,678 h on the curves against 270,726 h evenly (40% less). Month ends,
  hours (curves / evenly): 2011-10 3,557 / 45,918; 2011-12 91,565 / 149,079;
  2012-03 161,678 / 270,726; 2012-06 321,006 / 395,919; 2012-09 523,174 /
  582,594; 2012-12 729,931 / 746,807; both 834,430 at 2013-05-01.
- CCA's earned value is in cost (EGP), and these 36 assignments carry hours
  but no cost, so its cost PV, SPI and earned schedule are unchanged; the
  notes name the 35 non-linear curved assignments and their curves. Its data
  date (2011-09-30) is before every curved assignment starts, so planned
  hours to the data date are 0 either way.
- Curve id 9 is named in three files from P6 6.0, 7.0 and 24.12 and carried
  in none (one CCA assignment, both Expressway ones, all 234 on the Web
  file). It looks like a built-in curve P6 does not export; which one cannot
  be told from these files, so those assignments are spread evenly and the
  notes say so.

**Not checked.** No public file carries P6's own timephased spread of a
curved assignment (`target_crv`, P6's stored spread, is filled on 1 of 36,808
CCA assignments, and that one names the missing curve 9), so the slice
reading is not compared with P6's numbers. A P6 export with a curved,
cost-loaded assignment and its spreadsheet view (Resource Usage) would
settle it.
