---
title: "Seven columns of road casualties on paper: a change report that prints whole, and the seat-belt law"
seo_title: "Printing a multi-column changepoint report: wide time series on A4"
date: 2026-11-11
tags: [changepoint-detector, changepoint-detection, time-series, multivariate, reports, print]
description: "The several-column change report now prints wide sets whole. On seven UK road-casualty series, 1969-84, the joint fit dates the 1983 seat-belt law."
---

The [Changepoint Detector](../../ventures/changepoint-detector/) has a
branded report for several columns measured at the same points: a
small-multiples chart, the changes every setting agrees on column by column,
and one segmentation for all the columns with each column's shift in its own
noise. It is meant to be printed or saved as a PDF and handed to someone. Until
today a wide set did not fit the page.

## What broke on paper

Paper cannot scroll. The joint table sat in a box that scrolls sideways on
screen, and the chart is one image a printer cannot split. A headless-Chromium
check (`eval/multi-report-print.mjs`) prints the report on A4 with 15 mm
margins, which leaves 680 by 1009 CSS pixels, and measures the widest table
and the tallest chart:

| case | joint table | tallest chart |
|---|---|---|
| UK road casualties, 7 columns, level and volatility | 814 px | 631 px |
| synthetic, 12 columns, level | 1,081 px | 1,078 px |
| synthetic, 20 columns, level and volatility | 2,156 px | 1,792 px |

Anything past 680 px wide was cut off at the right margin. Anything past
1009 px tall ran off the bottom of the page.

## The fix

Past six columns (four when the volatility model adds an sd ratio to every
cell) the report now splits the columns into balanced groups. Each group gets
its own chart and its own joint table, captioned "Columns 1 to 4 of 7:
DriversKilled, drivers, front, rear" and kept whole on a page. Every chart
draws the same changes, so the groups line up by date. After the change all
four cases fit: the widest table is 648 px and the tallest chart 542 px. Sets
of two to four columns, the usual case, are laid out exactly as before; the
three sample reports regenerate byte for byte.

## What seven real columns say

The wide test set is real: R's `Seatbelts` table, the monthly UK series that
Harvey and Durbin used in 1986 to measure the front-seat belt law of 31
January 1983. Its columns are drivers killed, drivers killed or seriously
injured, front-seat and rear-seat passengers, distance driven, petrol price and
van drivers killed. We left out the source's `law` column, since it is the
answer.

- The joint level-and-volatility fit finds five changes, and one of them is
  **1983-02**, the first full month under the law.
- The column-by-column panel, the reading that held up best on labelled data,
  agrees on only three changes, all in the **petrol price**: 1974-04,
  1977-08 and 1979-06.
- The report itself warns that the joint fit is cutting more than once per
  50 points, so its 1983-02 is a lead, not a finding. The casualty counts are
  strongly seasonal and the several-column mode has no season term yet. One column at a time with `--period 12`, the detector does date the law
  (1983-01, with a range that holds February).

So the report prints whole now, and the data shows the next job: a season
term per column. Until then, for monthly counts, run the important column on
its own with its season.

The report is a planned paid extra and is not on sale. The detector, the CLI
and the CSV output are free and MIT licensed. A detected change describes the
data, not its cause. This is a statistical estimate, not advice.
