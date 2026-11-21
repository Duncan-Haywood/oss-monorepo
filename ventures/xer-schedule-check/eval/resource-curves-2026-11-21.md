# P6 resource curves in earned value, 2026-11-21

**Question.** P6 lets a planner put a resource curve on an assignment (Back
Loaded, Bell Shaped, Front Loaded, a curve of their own) so its units and cost
are spent unevenly over the activity. `evm.mjs` spread every assignment
evenly, so on a curved schedule its planned value, SPI and S-curve were not
the ones P6 shows. Does the XER carry the curves, and what changes when they
are used?

## What the files carry

The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md`. The curve table is
`RSRCCURVDATA`: a name and 21 numbers, `pct_usage_0` to `pct_usage_20`. An
assignment points at one by `TASKRSRC.curv_id`.

| File | Curves in the file | Assignments on a curve |
|---|---|---|
| CCA (6.0, hospital) | Back Loaded, Bell Shaped, Front Loaded, Linear, Triangular Increase, PCO119 (its own) | 37: PCO119 25, Back Loaded 7, one each on Bell, Front, Linear, Triangular Increase, and 1 on curv_id 9, which the file does not carry |
| example (24.12, Web) | none (the table is there, empty) | 234 on curv_id 9 (455,364 USD, 3,765 h) |
| Expressway (7.0) | none | 2 on curv_id 9 |
| hotel, terminal, sample | none | none |

**How the 21 numbers read.** In all six curves of the hospital file,
`pct_usage_0` is 0 and points 1 to 20 add up to exactly 100; "Linear" is 0 then
5 twenty times. So point k is the share of the k-th twentieth of the duration,
and point 0 the share at the start instant. `curves.mjs` reads them that way
(point 0 added to the first twentieth, so a hand-made curve with one loses
nothing; a curve not adding to 100 is scaled to 100 and named; one adding to
nothing is ignored and named). The twentieths are of the assignment's working
time on the activity's calendar, the basis the even spread already used.

## What was built

- `curves.mjs`: `curveTable` reads RSRCCURVDATA into cumulative shares;
  `tailF` gives the part of a curve after a share of the duration.
- `evm.mjs`: planned value spreads each assignment's budget by its curve over
  its planned dates; the remaining (forecast) spread follows the curve over
  the recomputed remaining dates, and for a started activity only the rest of
  the curve, from the share of the duration already done (1 - remaining /
  original duration). Actuals stay even from actual start to finish: they are
  history and the file does not say how they were spent. A curve the file does
  not carry is spread evenly and named. The planned value a series of updates
  holds as baseline (`pvCuts`, `evmseries.mjs`) follows the curve too.
- `measure: "hours"` (CLI `--hours`, page box *in labour hours*): earned value
  in labour hours even when cost is loaded, a manpower curve. The hospital
  file's curves sit on labour hours with no cost, so without this they were
  never read. `curves: false` (CLI `--even-spread`) keeps the old spread.
- **A fault found along the way.** On the hospital file the forecast curve in
  hours ended 97.32 h short of the estimate at completion. Four assignments
  carry actual hours on activities whose actual start is after the data date
  (an invalid date): their actuals were drawn after the data date, where the
  forecast curve no longer adds actuals. They are now drawn at the data date
  and counted in a note. Every curve now closes.

## Method

```
node eval/resource-curves.mjs <the six files> --json eval/resource-curves-2026-11-21.json
```

For each file and both measures: planned value at the data date with curves
and with the even spread; whether the planned curve ends on the budget and the
forecast curve on the estimate at completion; the widest month-end gap between
the two planned curves. Then, planted, every assignment of the file put on one
of P6's shipped curves in turn (Back Loaded, Front Loaded, Bell Shaped, the
hospital file's own rows), the same figures.

## Results

**The file's own curves.** Only the hospital file has curves to apply, and its
data date (2011-09-30) is before every curved assignment's planned start, so
planned value at the data date is unchanged (12,936,825 h). On the S-curve the
34 non-linear assignments (834,000 h of 35.7 million) move the planned curve by
up to 109,048 h (0.45%), at 2012-03-31. The other two files' 236 curved
assignments name curv_id 9, which neither exports; the tool says so and
spreads them evenly. That is the honest limit of the public data: the curve
most assignments use is one we cannot see.

**Planted, every assignment on one curve.** Planned value at the data date,
against the even spread:

| File | Measure | Even | Back Loaded | Front Loaded | Bell Shaped |
|---|---|---:|---:|---:|---:|
| example (24.12) | cost (USD) | 250,431 | 207,421 | 293,440 | 164,762 |
| example (24.12) | hours | 2,197 | 1,825 | 2,570 | 1,475 |
| CCA (hospital) | cost (EGP) | 330,091,170 | 303,510,918 | 356,671,421 | 326,437,098 |
| CCA (hospital) | hours | 12,936,825 | 12,481,090 | 13,392,561 | 13,005,478 |

On the 24.12 file SPI moves from 0.202 to 0.244 (Back Loaded) or 0.172 (Front
Loaded) for the same work: a curve is not a detail. Back and Front Loaded are
mirror images, and their gaps from the even spread are equal and opposite
(−43,009.74 and +43,009.75 USD; −26,580,251 and +26,580,251 EGP to within
80 on 330 million), which is what a correct spread of those two curves must
give. On all four files with assignments (hotel and Expressway have nothing
planned by their data dates; their S-curves move by up to 3,375 USD and
1,724 h), in both measures and all three curves, the planned curve ends on the
budget and the forecast on the estimate at completion: 24 of 24.

## Tests

`curves.test.mjs` (3): the hospital file's rows read as shares (Back Loaded
35% at half time, Linear equal to the even spread, Bell symmetric), scaling
and empty curves, the tail of a curve. `evm.test.mjs` (5 new): 1,000 on a
20-day assignment, ten days in, is 500 even, 350 Back Loaded, 650 Front
Loaded, 500 on Linear and with curves off; the baseline cut follows the curve
(175 after five days); a missing curve is even and named; a started activity's
forecast closes on its curve's tail; hours on a cost-loaded file; actuals
after the data date stay on the curve.

## Limits

- Not checked against P6's own spread: no public file carries P6's
  timephased planned units (P6 computes them on screen; an XER holds no
  spread). The reading of the 21 points rests on the six curves' own sums and
  on Linear equalling the even spread. A P6 user's spreadsheet export of a
  curved activity's planned units would settle the within-twentieth detail.
- P6's own handling of a curve on a started activity may differ from the
  rest-of-the-curve rule here; P6 also has a "recalculate actual units and
  cost" option this does not model.
- curv_id 9 is the curve most public assignments use and no file carries.
