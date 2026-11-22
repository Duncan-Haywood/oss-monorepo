---
title: "When is each submittal due? Matching spec sections to a P6 schedule, checked on four real jobs"
seo_title: "Submittal due dates from a P6 schedule, checked on four jobs"
date: 2026-11-22
tags: [construction, submittals, scheduling, primavera-p6, evaluation]
description: "The free submittal register now dates every submittal from a P6 .xer. On 80 held-out pairs from four public schedules, 72.5% matched the right activity."
---

A submittal log tells a project engineer what to send the architect. It does not tell them when. The date that matters is the day the work goes in, worked back through the architect's review time (twice, if you expect one resubmittal) and the fabricator's lead time. Paid construction platforms do this by linking each spec section to a schedule activity. On a small job, someone does it by hand in a spreadsheet, if anyone does it at all.

The [submittal register](../../ventures/submittal-register/README.md) ([live page](https://marisstella.app/submittal-register/)) already read a spec book PDF and listed every Part 1 submittal. As of today it also takes the project schedule. That can be a Primavera P6 `.xer` export, or a CSV with an activity name and a start date. Every row then gets a **Submit By** date. Like the book, the schedule is read inside the browser tab and never uploaded.

## How a date is worked out

1. **Need-by.** Each spec section is matched to the first activity that installs its work. If an activity's ID or name carries the section number (`09 91 23`), it wins. Otherwise activity names are scored on trade words for that part of MasterFormat ("sprinkler", "fire fighting" for 21 13; "gypsum", "drywall", "partition" for 09 29) and on the section title's own words. Some activities are skipped: submit, approve, procure, scaffolding and change-order steps, milestones, and activities that read more like another trade's work. Among the near-best matches, the earliest start wins, because the first install is what a late submittal holds up.
2. **Review time.** This is read from the book's Division 01 ("Allow 15 days for initial review") when the book states it. Otherwise the tool assumes 14 calendar days and says so. The review time is multiplied by the number of review cycles, which defaults to two.
3. **Lead time** per section, which you type in ("05 12=56, 08 71=70"). The tool doesn't guess it.
4. **Submit By** = need-by, minus lead time, minus review time × cycles. Closeout items are due one review period before the schedule's last finish. If the schedule has a data date, rows already past their date are flagged.

## How often the match is right

Four public P6 exports were used: a hotel (4,236 activities), a hospital (16,146), an airport terminal (66) and an expressway (823). They were matched against 545 spec sections from the Unified Facilities Guide Specifications. I read each pair and asked one question: would this activity's start be a fair "needed on site by" date for this section's submittals?

A first sample of 60 pairs found the obvious faults. "Membrane" matched the blinding under a slab. Change-order activities ("VO-010 ... Door and Hardware Rationalization") looked like first installs. A concrete pit for a chilled-water line dated the hydronic piping. Room names in parentheses ("Sprinkler main pipe (Locker RM)") dated the lockers. Those were fixed. Then a fresh sample of 80 pairs was scored once:

| Schedule | right | early but safe | wrong |
| --- | ---: | ---: | ---: |
| hotel | 14 | 0 | 6 |
| hospital | 13 | 1 | 6 |
| airport terminal | 16 | 0 | 4 |
| expressway | 15 | 1 | 4 |
| all 80 | 58 (72.5%) | 2 | 20 (25%) |

One in four is wrong, so a person still has to read the result. Most misses are a generic word standing in for a product: "door" picks the first door of any material, "panel" the first panel, "lift" a platform lift. Every row therefore shows the activity it used and the words it matched on, and a section can be pinned to the right activity ID. That still turns a day of matching 50 sections to a 4,000-line schedule into checking a list. Full method and the cases: [`eval/schedule-match-2026-11-22.md`](../../ventures/submittal-register/eval/schedule-match-2026-11-22.md).

## What it doesn't show yet

The real test is a job's own spec book against that same job's schedule. These pairs mix government guide sections with private schedules, and most sections would never appear in a hotel's book. I found no public book-and-schedule pair from the same job. One reader graded the matches. The next step is weighing material words (aluminium, steel, wood) so a door section stops taking the first door of any kind.

*Written with AI assistance. The numbers are from the eval file linked above. The tool is free and MIT licensed, and its output is a starting list, not professional advice.*
