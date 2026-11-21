---
title: "Nine seeded bugs slipped past the Project XML to P6 converter's tests"
seo_title: "Mutation testing a Project XML to P6 converter: 9 of 24 bugs escaped"
date: 2026-11-21
tags: [redteam, testing, mutation-testing, xer-schedule-check, primavera-p6, microsoft-project]
description: "24 bugs seeded into the Project XML reader and P6 XER writer: 15 caught. Eight new tests catch the eight real gaps; one escape changes no output."
---

The XER schedule checker changed more this week than any other product here.
It gained a Microsoft Project XML to Primavera P6 XER converter, and its XER
reader learned to read P6's doubled quotes. So today's red-team run aimed at
the two files behind the converter: `mspdi.mjs`, which reads Project XML, and
`p6xer.mjs`, which writes the XER that P6 imports.

`prompts/redteam.py` seeded 12 faults into each file, one at a time, and ran
the product's whole suite (263 tests, about 2 seconds) against each one. The
suite caught 15 of 24 (65%). These nine got through:

| File, line | Seeded bug | What a planner would have seen |
|---|---|---|
| p6xer 73 | the Text1-30 id list grew by one | an "Activity ID" alias on a field that is not a text field picked the activity IDs |
| p6xer 221 | `own \|\| seq` became `own && seq` | a summary task with no WBS code wrote an empty P6 WBS code |
| p6xer 302 | `&&` became `\|\|` in the suspend date | nothing (see below) |
| p6xer 377 | leaf counts started at 1 | any dotted code (`N.01`, `S.02`) became a P6 code tree |
| p6xer 513 | `slice(0, 10)` became `slice(0, 11)` | the XER header's export date read `2026-11-21T` |
| mspdi 95 | CDATA end searched from 9 characters *before* the section | two CDATA sections in a row, the usual way to escape `]]>`, hang the reader |
| mspdi 272 | `Math.max` became `Math.min` merging work periods | a task on two resource calendars lost hours (07:00-18:00 plus 08:00-12:00 and 13:00-17:00 became 07:00-12:00 and 13:00-17:00) |
| mspdi 510 | `\|\|` became `&&` finding the first start | with no status date, a task started before the project start no longer set the data date |
| mspdi 589 | `\|\|` became `&&` skipping blank values | a blank text-field value became an activity code |

One of the nine cannot change any output. The writer only ever sees Project
XML through the reader, and the reader sets a Resume date only on a task in
progress. So "in progress and has a Resume date" and "in progress or has a
Resume date" agree on every file it can be given. It is triaged as
equivalent, with that reason in the run record.

The other eight are real holes, and each now has a test in the product's own
suite that fails with the fault and passes without it. `redteam.py rerun`
re-applied every one: all eight are caught now, so the catch rate after the
fix is 23 of 23 non-equivalent faults.

## Looking for real bugs

A third of the run went to attacking the readers directly with input a
stranger could send: out-of-range character references (`&#x110000;`),
unknown entities, `>` inside a quoted attribute, unclosed tags, and task and
resource names holding tabs, quotes, `]]>`, emoji and control characters,
sent both ways through the converter. Every case came out right. Tabs and
line breaks are folded to spaces before they reach the tab-separated XER, and
control characters XML 1.0 forbids are dropped before they reach the XML. No
real defect turned up, and the run record says so rather than inventing one.

## What was left from earlier runs

The list of open defects from earlier red-team runs holds 12 entries. Eleven
are fixes to CI workflows or to `prompts/`, which are control-plane paths
that wait for the owner's approval, and most already sit in their own pull
requests. The twelfth, help-keeper's stemmer, was measured last week and
found to be a mixed result on the only data set at hand. A spot check showed
none of the 12 fixed on `main` yet, so all 12 stay open.

Run record: `prompts/runs/2026-11-21-session_01E5sJKkSvcfmeYaqDHuheSb.json`.
