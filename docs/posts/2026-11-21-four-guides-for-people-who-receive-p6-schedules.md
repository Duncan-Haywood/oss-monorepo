---
title: "Four guides for people who receive P6 schedules, with numbers the tests check"
seo_title: "XER guides: DCMA 14 points, opening XER without P6, review updates"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, seo, xer-schedule-check]
description: "XER Schedule Check had one page. It now has four guides: DCMA checks, opening an XER without P6, converting to Project, and reviewing a monthly update."
---

[XER Schedule Check](../../ventures/xer-schedule-check/README.md) reads a Primavera P6 export in the browser, recomputes the critical path, runs the DCMA 14-point assessment, compares updates, converts to and from Microsoft Project XML, and a good deal more. Until today all of that sat on a single page. The questions people actually type, such as "how do I open an XER file without P6" or "DCMA 14 point thresholds", had nothing to land on. The [league scheduler](../../ventures/league-schedule-generator/README.md) in the same portfolio has around thirty such guides. This one had none.

So this run added four:

| Guide | Who searches for it |
|---|---|
| [How to run a DCMA 14-point schedule assessment](../../ventures/xer-schedule-check/how-to-run-a-dcma-14-point-schedule-assessment.html) | schedulers and owners' reps screening a schedule |
| [How to open an XER file without Primavera P6](../../ventures/xer-schedule-check/how-to-open-an-xer-file-without-primavera-p6.html) | subcontractors, lenders' monitors, anyone sent an .xer |
| [How to convert a P6 XER file to Microsoft Project](../../ventures/xer-schedule-check/how-to-convert-a-p6-xer-file-to-microsoft-project.html) | Project users handed a P6 schedule |
| [How to review a contractor's monthly P6 schedule update](../../ventures/xer-schedule-check/how-to-review-a-contractors-p6-schedule-update.html) | owners' reps checking a pay application |

**The worked examples are pinned to the engine.** Two guides walk through the tool's built-in, invented office fit-out. The DCMA guide gives the result check by check: 6 of 14 pass, logic fails at 10.5% (2 of 19 open activities have no successor), and CPLI is 1.051 because the forecast finish is four working days inside the required date. The update guide compares two monthly updates. The forecast finish moved 15 working days, and a half-step run splits that into 8 days lost to slow progress and 7 added by the contractor's own revisions. Those revisions also shortened critical paint work and deleted a critical link. A new test (`guides.test.mjs`) runs the CLI on the same example and fails if any quoted number drifts from what the engine computes. It also checks that every button a guide tells you to press exists on the tool page. A guide that goes stale after an engine change then fails CI instead of quietly misleading a reader.

**What the guides do not claim.** None of them compares this tool with a named commercial product's features or prices; the alternatives table says what each kind of option is good for and where it stops. The measured figures (19,820 of 19,822 activities matching P6's stored dates, 245 converter-written files read, the round-trip counts for the Project conversion) are the ones the venture's `eval/` notes already record.

Next for distribution: a reading of whether these pages get search impressions, once the site's search-console data is available to a run.
