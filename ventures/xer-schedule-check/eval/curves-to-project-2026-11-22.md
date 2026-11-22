# P6 resource curves as Microsoft Project timephased work, 2026-11-22

**Question.** `msproject.mjs` (XER to Microsoft Project XML) wrote every
assignment flat. An assignment on a P6 resource curve (`TASKRSRC.curv_id`:
Back Loaded, Bell Shaped, a contract's own curve) reached Project spread
evenly, so Project's resource usage and its S-curve lost the shape the
scheduler had put in. Can the shape be carried, and does it come out right?

**Why not a contour number.** Project has no curve table. Its seven built-in
contours are fixed shapes of its own (measured yesterday:
`eval/work-contours-2026-11-21.md`), not P6's curves of the same names, and a
custom curve such as the hospital file's PCO119 has no counterpart. What
Project does keep is an assignment's timephased work: MSPDI
`Assignment/TimephasedData` rows (Type 1, remaining work), the rows Project
itself writes for every assignment. Writing those rows with WorkContour 8
("Contoured", Project's own value for a hand-edited spread) carries any
curve exactly.

**What is written.** For each assignment with a curve that is not even, no
actual units and remaining units > 0 (`curves.mjs`, `curveRows`):

- rows of elapsed time from the task's start to its finish, cut at every
  midnight and at the twenty slice ends of the curve (in working time on the
  task's calendar, rounded to the minute), so each row's work falls at one
  rate over its working time, as Project spreads a row;
- each row's work to the second, rounded on the running total, so the rows
  sum to the remaining units exactly; rows with no work carry no Value (a
  zero Value between rows with work is how Project marks a split, and
  `mspdi.mjs` reads it so);
- WorkContour 8, or 1-7 where the curve is one of Project's contours (as
  `p6xer.mjs` writes them, "MS Project Bell"), so a Project -> XER ->
  Project trip gives back the contour it started with.

Started assignments keep an even spread of what is left, as `evm.mjs` does:
how P6 re-fits a curve to a started assignment's remaining units is in no
public file. An even curve (Linear) and a curve id with no RSRCCURVDATA row
write no rows; the conversion's notes count all three.

**Method.**

```
# Project's own files (MPXJ junit/data, read for measurement, not copied here)
curl -sSfLO https://raw.githubusercontent.com/joniles/mpxj/master/junit/data/{mspditimephased,mspditimephasedsegments,mspdiresource}.xml
# the public hospital file (eval/cpm-vs-p6-2026-11-19.md)
curl -sSfL -o CCA.xer https://raw.githubusercontent.com/MutahirAbbas/xer-checker/2296ee1/data/CCA_R03_dt_24Oct11SC.xer
node eval/curves-to-project.mjs mspdi*.xml --xer CCA.xer --out out --json eval/curves-to-project-2026-11-22.json
python eval/curves-to-project-mpxj.py out --json eval/curves-to-project-mpxj-2026-11-22.json   # pip mpxj 16.10.0 jpype1
```

Three checks, then an independent reader:

- **A. Round trip on Project's files.** Every contoured assignment (19, all
  seven contours, units 0.5 to 1.5, day, night-shift and 24-hour
  calendars) goes Project XML -> `p6XerText` -> `mspdiText`. The written
  assignment (matched by task and resource name) must carry the same
  WorkContour; its rows' cumulative work, read at each of Project's own row
  ends, is compared with Project's.
- **B. Planted P6 curves.** P6's seven shipped shapes (MPXJ's WorkContour
  constants) and Linear on the six-activity example: the written rows' work
  per day against `spreadCurve` (the earned-value spread) over the same
  dates, and their sum against the remaining units.
- **C. A real P6 file's own curves.** The public CCA hospital file (P6 6.0):
  its 36 curved assignments, the same two comparisons.
- **MPXJ.** MPXJ's MSPDI reader on every written file: the contour it
  reads, and its raw timephased remaining work row by row against the rows
  in the file.

## Result

**A. Project -> XER -> Project: 19 of 19 contours come back, and Project's
own spread with them.**

| | Contour back | Largest gap, cumulative work | Flat (before today) |
|---|---|---|---|
| 19 assignments, 3 files | 19 / 19 | 0.037 h (15 of 19: 0) | 31.25 h |

The four non-zero gaps (0.012 and 0.012 h on the two 150% assignments, 0.017
and 0.037 h on the two turtles) are Project's stretched finishes, stored to the second
(10:17:06), against the XER's minute.

**B. Planted P6 curves:** 14 assignments with remaining work (two per
shaped curve; the example's other 18 assignments have no remaining units, so
write nothing) carry WorkContour 8, give the earned-value spread day by day
within 0.0002 h, and sum to the remaining units exactly. Linear writes no
rows.

**C. The hospital file: 33 of 33 unstarted curved assignments written.**

| | Count |
|---|---|
| Curved assignments in the project | 36 |
| Written as contoured work | 33 (PCO119 23, Back Loaded 7, Triangular Increase 1, Front Loaded 1, Bell Shaped 1) |
| Nothing left to spread | 3 |
| Rows per assignment | 70 to 567 |
| Largest daily gap to the earned-value spread | 0.0003 h |
| Largest gap in the sum to remaining units | 0 |

One more assignment names curve id 9, which the file does not carry; it is
written even and the notes say so.

**MPXJ reads all of it back:** 66 of 66 assignments (the 33 hospital ones,
19 round-tripped, 14 planted) have the same number of rows with work and
each row's hours within 0.00006 h (a fifth of a second), and the contour MPXJ reads is the one written (CONTOURED, or
BACK_LOADED and so on after a round trip), 66 of 66.

## What is not shown

- That Project itself opens these rows and keeps them: no Project here.
  MPXJ is the independent reader, and the rows follow the layout Project
  writes (same Type, Unit 2 for whole days and 1 for parts, empty Value on
  time with no work). A Project open is the next check.
- P6's own spread: no public XER stores P6's timephased numbers for a curved
  assignment (`eval/resource-curves-2026-11-21.md`); the spread is the slice
  reading `evm.mjs` uses.
- Started assignments: written even. A file with a started curved
  assignment and P6's resource usage export would settle the re-fit.
- Cost: the rows are work. Project derives cost from work and rates; an
  assignment whose P6 cost is not units x rate keeps P6's total cost but not
  a curved cost per day.
