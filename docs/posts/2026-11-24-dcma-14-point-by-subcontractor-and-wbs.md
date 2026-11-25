---
title: "DCMA 14-point by subcontractor: whose work fails, not just whether the schedule does"
seo_title: "DCMA 14-point assessment by subcontractor or WBS, free from an XER"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, dcma]
description: "XER Schedule Check now scores the DCMA points per WBS node or activity code, so each subcontractor gets its own row. Checked on six public P6 files."
---

A DCMA 14-point check on a whole schedule ends with a sentence like "17.6% of
relationships carry a lag". True, and nobody owns it. The owner's rep sends it
to the general contractor, who has to work out whose fragnets hold the lags
before anything gets fixed. Commercial schedule-analysis seats answer this
with a "ribbon" view: the same metrics broken down by WBS or activity code,
one row per area or subcontractor.

[XER Schedule Check](../../ventures/xer-schedule-check/) does that now, free
and in the browser. Open a P6 XER (or P6 XML, or Microsoft Project XML), pick
WBS or any activity code the scheduler set up, and press **Break down the 14
points**. Each group gets points 1 to 11 scored on its own activities against
the same DCMA thresholds, worst first, with a CSV to send each party its row
(`node cli.mjs schedule.xer --ribbon Responsibility` from the command line).
A relationship counts under its successor, since the successor's scheduler
owns the link into their work. The critical path test, CPLI and BEI describe
the whole network, so they stay project-wide.

## What it shows on real files

On a public hotel schedule (4,217 open activities) grouped by its
Responsibility code, the project fails 5 points, but not the same 5 for
everyone:

| Responsibility | Open | Lags | High duration | No resource |
|---|---|---|---|---|
| Aluminium subcontractor | 60 | 35.9% | 21.8% | 100% |
| Main contractor | 2,311 | 17.7% | 0.3% | 97.6% |
| MEP subcontractor | 1,404 | 20.4% | 1.2% | 5.1% |
| Steel structure subcontractor | 91 | 7.1% | 5.5% | 100% |

The MEP subcontractor resource-loaded its work; the main contractor did not.
The aluminium subcontractor's 60 activities hold the most lags and the most
long activities. Three different letters.

On the public CCA hospital file (14,270 open activities) by division, Fire
Protection and Telecom and Security have 92.7% and 98.3% of their open
activities on negative float. Across the whole file it is 3.8% (544
activities), because 12,845 open activities carry no division and almost none of
them is on negative float. The project-wide point hides the two trades that
are behind.

## How it was checked

`eval/ribbon-check.mjs` runs every WBS level from 1 to 3 and every flat
activity code type on the six public P6 files the tool is tested on: 58
groupings. In every one, each point's group counts add up to the project-wide
count, every group's pass flag matches its count against the threshold, and
all 34,287 findings land in the same group when assigned a second way, by
their activity ID text looked up in the file's own WBS and code tables rather
than through the ids the module uses. The details are in
`ventures/xer-schedule-check/eval/ribbon-check-2026-11-24.md`, and a
[guide](../../ventures/xer-schedule-check/how-to-break-down-a-dcma-assessment-by-subcontractor.html)
walks through it.

Two cautions. Small groups swing: one activity in a group of three is 33%, so
read the count beside the percentage. And the breakdown is only as good as the
coding; on the hospital file most of the work has no division at all, which is
itself worth a comment to the scheduler.

The DCMA points are screening metrics, not a verdict on a schedule, and none
of this is scheduling, contractual or legal advice. The tool is not affiliated
with Oracle or the DCMA.
