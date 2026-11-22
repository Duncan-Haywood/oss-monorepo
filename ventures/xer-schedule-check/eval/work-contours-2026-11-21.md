# Microsoft Project work contours as P6 resource curves, 2026-11-21

**Question.** Microsoft Project lets an assignment follow a *work contour*
(MSPDI `Assignment/WorkContour`: 1 back loaded, 2 front loaded, 3 double
peak, 4 early peak, 5 late peak, 6 bell, 7 turtle). Until today `p6xer.mjs`
(Project XML to P6 XER) dropped them, and every contoured assignment came
into P6 spread evenly. P6 has resource curves with the same names. Can the
contour be carried, and what shape is it really?

**Why not use P6's curves of the same names.** MPXJ, the open-source reader
most converters use, reads a Project contour as the P6 curve of that name
(its `WorkContour` constants: "Back Loaded" is ten twentieths at 3.5% of the
units, then ten at 6.5%). Whether Project spreads work that way is a
question about Project, and Project's own files can answer it: an MSPDI
file stores Project's spread of every assignment as timephased rows.

**Data.** Every MSPDI file in MPXJ's test corpus (github.com/joniles/mpxj,
`junit/data`, sparse clone 2026-11-21; read for measurement, not copied
here) with a built-in contour: 19 assignments in 3 files saved by Project
(`mspditimephased.xml`, `mspditimephasedsegments.xml`, `mspdiresource.xml`),
covering all seven contours, units 0.5, 1 and 1.5, and day, night-shift and
24-hour calendars. None has actual work, so each assignment's remaining-work
rows (`TimephasedData` Type 1) are Project's whole spread. 18 more
assignments are contour 8 (hand-edited timephased work, no fixed shape).

**Method.**

```
node eval/work-contours.mjs <mpxj>/junit/data --json eval/work-contours-2026-11-21.json
node -e '<p6XerText each of the 3 files to <out>/<stem>.xer>'
python eval/work-contours-mpxj.py <out> --json eval/work-contours-mpxj-2026-11-21.json
```

For each assignment, on the task's calendar as `mspdi.mjs` builds it
(resource calendars included):

1. **Shape.** Each row's work per working hour, over the assignment's
   peak units (`Units`), averaged over each tenth of the working time from
   `Start` to `Finish`.
2. **Span.** That working time against work / units x 1 / (mean
   percentage).
3. **Spread.** Project's cumulative work at every row's end against the work
   before that moment when the assignment is spread over its dates by
   (a) the measured contour, (b) MPXJ's P6 curve of the same name, (c)
   evenly. The largest gap in hours is reported.
4. **Conversion.** `p6XerText` on each file: one curved TASKRSRC per
   contoured assignment, and the curve reads back (`curves.mjs`, and
   separately MPXJ's XER reader) as the contour.

## Result

**Project's contours are ten equal segments of the working span, each at a
fixed percentage of the peak units**, and the work is fixed, so the span
stretches to work / (units x mean percentage):

| Contour | Ten segments, % of peak units | Mean | Span for 80 h at 100% |
|---|---|---|---|
| Back loaded | 10 15 25 50 50 75 75 100 100 100 | 60% | 133.3 h |
| Front loaded | 100 100 100 75 75 50 50 25 15 10 | 60% | 133.3 h |
| Double peak | 25 50 100 50 25 25 50 100 50 25 | 50% | 160 h |
| Early peak | 25 50 100 100 75 50 50 25 15 10 | 50% | 160 h |
| Late peak | 10 15 25 50 50 75 100 100 50 25 | 50% | 160 h |
| Bell | 10 20 40 80 100 100 80 40 20 10 | 50% | 160 h |
| Turtle | 25 50 75 100 100 100 100 75 50 25 | 70% | 114.3 h |

Late peak is not early peak reversed (early peak's tail is 25 15 10, late
peak's head is 10 15 25 but its tail is 50 25).

| Check | Result |
|---|---|
| Shape: largest gap from the table, any segment of any assignment | 0.06 percentage points (17 assignments 0.00; two 24-hour rows each cover a whole segment boundary, so 9 of 10 segments are seen) |
| Span: work / units / mean against Project's Start to Finish | 19 of 19 within 0.3 minutes |
| Spread, largest cumulative gap (h): measured contour | **0.035** (19 of 19 within 0.05 h) |
| ... P6 curve of the same name (MPXJ's reading) | 15.83 (0 of 19 within 0.05 h; 9.5 h of 75 h on back and front loaded, 2.4 h of 80 h on bell) |
| ... even spread (what the converter wrote before today) | 31.25 (0 of 19) |
| Conversion: contoured assignments with a curve in the XER | 19 of 19 (10, 8 and 1 per file; 2, 7 and 1 curves) |
| ... curve read back by `curves.mjs` | 19 of 19 equal to the contour to 1e-5 of the work |
| ... curve read back by MPXJ's XER reader | 19 of 19 to 1e-5 (largest 1.7e-6: the values are written to 4 decimals of a percent) |

The 0.035 h is the 40-hour turtle in `mspdiresource.xml`, whose rows Project
rounds to 3 decimals of a minute-based rate; the 150% pair's 0.01 h is its
finish at 11:53:18.

## What shipped

- `contours.mjs`: the table above, the 20 slices in `curves.mjs`'s format,
  P6 curve values, and the span factor.
- `p6xer.mjs`: an assignment with contour 1-7 gets `TASKRSRC.curv_id` and a
  global `RSRCCURVDATA` row named "MS Project <contour>" (not P6's own
  "Back Loaded" etc., whose shapes differ), written before PROJECT as P6
  does. A warning names the curves; contour 8 (hand-edited) is named as
  written evenly. The task's dates already hold Project's stretched span, so
  P6 spreads the units and cost over the dates Project shows, in Project's
  shape, and earned value on the converted XER (`evm.mjs`) uses it.

## What is not known

- **A P6 import.** No P6 seat here. Whether P6's import keeps a curve id
  from the file or matches curves by name is not known; the names chosen
  avoid colliding with P6's shipped curves.
- **Assignment dates.** TASKRSRC takes the task's planned dates. Where a
  task has two assignments with different contours, Project gives each its
  own span and the task the longest; P6 here spreads each over the task's.
  No corpus task has two contoured assignments.
- **Contoured work with actuals.** Every measured assignment is unstarted.
  How Project re-fits a contour once actual work is booked (rows of type 2)
  is not measured.
- **P6 to Project.** A P6 curve is not written back as a contour: Project's
  contours change the span, P6's curves do not, so only a curve equal to
  one of these seven shapes could be carried, and none of the public P6
  files has one.
