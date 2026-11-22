---
title: "Carrying P6 resource curves into Microsoft Project, day by day"
date: 2026-11-22
tags: [construction, scheduling, microsoft-project, primavera-p6, xer]
description: "An XER converted to Project XML now keeps each P6 resource curve as timephased work: 33 of 33 on a public hospital schedule, read back by MPXJ."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) turns a Primavera
P6 XER into Microsoft Project XML, for the owner's rep or estimator who is
sent a P6 schedule and works in Project. Until today the conversion wrote
every resource assignment flat. A scheduler who had put an assignment on
P6's Back Loaded curve, or on a contract's own curve, saw it spread evenly in
Project: the resource usage view, the labour histogram and the S-curve all
lost the shape.

Yesterday's post went the other way and found that
[Project's contours are not P6's curves](./2026-11-21-microsoft-project-work-contours-measured.md)
of the same names. So a P6 curve can't simply become a Project contour
number. Back Loaded in P6 is ten twentieths at 3.5% and ten at 6.5%.
Project's back loaded is ten segments rising from 10% to 100% of peak
units. A custom curve like the hospital file's "PCO119" has no Project
counterpart at all.

## What Project does keep

Project stores how it spreads every assignment, as rows of timephased work
in the XML file (`TimephasedData`, type 1 for remaining work). An assignment
whose rows were edited by hand is marked contour 8, "Contoured". That is a
place to put any shape. The converter now writes, for each assignment on a
curve that has not started:

- rows from the activity's start to its finish, cut at every midnight and at
  the curve's twenty slice ends, so the work in each row falls at one rate;
- each row's hours to the second, rounded on the running total, so the rows
  add up to the remaining hours exactly;
- contour 8. Where the curve came from a Project contour on an earlier
  conversion, the contour's own number goes back instead, so a file sent
  Project to P6 to Project comes back as it left.

## How it was checked

All files are public; the scripts and numbers are in
[the evaluation note](../../ventures/xer-schedule-check/eval/curves-to-project-2026-11-22.md).

- **A real P6 schedule.** The public hospital file (P6 6.0, 36,808
  assignments) has 36 on curves. 33 have hours left, and all 33 were written
  (23 on PCO119, 7 Back Loaded, one each on Triangular Increase, Front
  Loaded and Bell Shaped), with 70 to 567 rows each. Day by day they match the
  spread the tool's earned-value view uses to within 0.0003 hours, and they
  sum to the remaining hours exactly.
- **Project's own files, there and back.** The 19 contoured assignments in
  the open-source MPXJ project's test files, saved by Project, went to XER
  and back. All 19 came back with their contour. Read at each of Project's
  own row ends, the cumulative work matched Project's to 0.037 hours, 15 of
  them exactly. Before today the trip came back flat, up to 31 hours off.
- **A second reader.** MPXJ, an independent library most schedule
  converters build on, read every written file back. It found the same rows
  with work and the same hours on each row, and the contour that was written,
  66 assignments out of 66.

## What is still open

Nobody here has opened the rows in Microsoft Project itself. They follow
the layout Project writes, and MPXJ reads them, but a Project open is the
next check. Assignments already under way are still written flat, because
how P6 re-fits a curve to the hours left is not in any public file. The rows
carry work, so Project works out cost from rates, not from a curved cost.

The converter runs in the browser, so the schedule never leaves your
machine: open an XER on the [tool page](../../ventures/xer-schedule-check/)
and press **Download for Microsoft Project (.xml)**, or run `node cli.mjs file.xer --to-project file.xml`.
