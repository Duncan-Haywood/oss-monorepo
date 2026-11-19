# Three-point ranges from P6 UDFs on six public P6 files, 2026-11-19

**Question.** The risk run needs an optimistic, most likely and pessimistic
duration per activity, and an XER file stores one duration. Schedulers who
already ran a risk review keep the three points in activity user-defined
fields (UDFs), which the export carries in its UDFTYPE and UDFVALUE tables.
Does `udf-ranges.mjs` read them, without anyone retyping them as CSV, and
does it leave a file alone when its UDFs hold something else?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched
for the check, not committed). None stores duration ranges. Two have numeric
activity UDFs of their own: CCA 15 (`Actual Cost`, `No.of Wor Days`,
`Duration|Differe`, `RENZ % COMPLETE`, `Claimed This Month`, `user_number8`
and others, 41,731 UDFVALUE rows in all) and Expressway 1 (`DIFF`).

**Method.** `node eval/udf-ranges-check.mjs <dir> --runs 40 --json
eval/udf-ranges-check-2026-11-19.json`. Per file:

1. As exported: does the name guess (`guessRangeFields`) read any of the
   file's own UDFs as a range field? It must not: a wrong guess would quietly
   replace the default range with, say, a cost.
2. Planted: three FT_FLOAT_2_DECIMALS activity UDFs ("Optimistic Duration",
   "Most Likely Duration", "Pessimistic Duration") added beside the file's own
   UDFTYPE and UDFVALUE rows, for every open activity of the project the risk
   run reads. Values from a seeded generator: optimistic 60-100% and
   pessimistic 100-180% of the remaining duration, stored at two decimals as
   P6 keeps them; one activity in ten gets only the optimistic value. The
   40-run risk analysis with the UDF ranges must equal, percentile for
   percentile and activity for activity (criticality and sensitivity), the
   same run with the same numbers pasted as CSV lines, and the half-filled
   activities must be named and left on the default range.
3. The same plant in hours ("... Dur (hrs)"), in % of the remaining duration
   ("... %"), and with no most-likely field (the remaining duration stands
   in), each against its own CSV run; and the largest P10-P90 gap to the
   days run, which only two-decimal storage in another unit can cause.

**Result.**

| File | Own numeric UDFs | Read as a range as exported | Planted (full / half) | Read | Half named | UDF run = CSV run (days, hours, %, no likely) | Largest gap to the days run | Time, 40 runs |
|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 15 | none | 12,294 / 1,359 | 12,294 | 1,359 | 4 of 4 | 0 days | 4.6 s |
| Expressway (7.0) | 1 | none | 733 / 88 | 733 | 88 | 4 of 4 | 0.1 days | 0.1 s |
| hotel (6.0) | 0 | none | 3,553 / 401 | 3,553 | 401 | 4 of 4 | 0 days | 0.5 s |
| example (24.12) | 0 | none | 324 / 41 | 324 | 41 | 4 of 4 | 0 days | <0.1 s |
| terminal (5.0) | 0 | none | 58 / 5 | 58 | 5 | 4 of 4 | 0.1 days | <0.1 s |
| sample (20.12) | 0 | none | 27 / 3 | 27 | 3 | 4 of 4 | 0.1 days | <0.1 s |
| **Total** | 16 | **0 of 16** | 16,989 / 1,897 | 16,989 | 1,897 | **24 of 24** | | |

No planted range was out of order against the remaining duration (the
risk run's `inconsistentRanges`, 0 on every run). The name guess found the
planted fields in every variant (days, hours, % and the two-field form).

**Reading.**

- The UDF path is the CSV path: every one of 24 runs over 16,989 activities
  gives the same percentiles, criticality and sensitivity as pasting the
  same numbers, so the Monte Carlo checks already made on these files
  (`eval/risk-check-2026-11-19.md`) carry over to ranges kept in the file.
- The guess reads names, not values. It needs a word that names one point
  (optimistic, pessimistic, most likely, best case, worst case) or a weaker
  one (min, max, low, high, BC, WC) beside a duration word. That is why
  "Max Qty", "Min/Max Dur", "WC fixtures" and the 16 real UDFs here stay
  unread. A field named some other way is picked by hand: the page's three
  pickers, or `--ranges-udf "short,-,long"` by label or id.
- The 0.1-day gaps in hours and % are storage, not the method: each planted
  point is rounded to two decimals in its own unit, so a value stored in
  hours or in % of the remaining duration can differ from the days value by
  a fraction of a minute, and a draw near a rounding edge lands one minute
  apart. Against its own CSV numbers each variant is exact.

**What this cannot show.** No public XER keeps real ranges in UDFs, so
whether real schedulers' field names match the guess is untested. Next: a
real export from a job that ran a risk review, to check the names and how
many activities are filled in.
