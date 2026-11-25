---
title: "Scoring a P6 schedule engine against 338 public P6 probe files"
seo_title: "Checking a CPM engine against Primavera P6 23.12 probe files"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, cpm]
description: "XER Schedule Check's CPM engine against P6 23.12 on 338 public probe files: 2,953 of 5,199 rows match, one SF rule fixed, and the next gap named."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a
Primavera P6 schedule in the browser: early and late dates, total and free
float, then the checks built on them (DCMA, time impact analysis, the
review of an update). The whole product depends on that engine giving the
dates P6 gives. Until today it was scored on one kind of evidence: six real
P6 exports, where P6's own dates are stored in the file. On those it matches
19,908 of 19,935 open activities on early finish, late finish and total
float.

Real files have a weakness as a test, though. They are mostly ordinary
finish-to-start logic. Rare cases show up once or not at all: the six files
hold three start-to-finish links between them, and not one start-to-start
link whose lag runs on a calendar other than the predecessor's.

## A second oracle

A code search turned up a better source for the rare cases.
[cpp-cpm-engine](https://github.com/danafitkowski/cpp-cpm-engine) (MIT) is
another CPM engine, and its author publishes the tests they ran against P6:
338 small synthetic XER files, each built to isolate one behaviour, imported
into Primavera P6 Professional 23.12.1 and scheduled once. P6's six values
for every unfinished activity (early start and finish, late start and
finish, total and free float) were read back from P6's database and committed
next to the files, with a README for each set saying what it probes.

That is P6's own output on exactly the cases real files rarely contain:
work set As Late As Possible while it is under way, start-to-finish links
into started work, progress override against retained logic, mandatory
constraints, and resource-dependent activities. So we scored our engine
against all of it: `node eval/p6-probes.mjs`, half a second for the whole
set.

## The score

**2,953 of 5,199 rows match P6 on all six values** (2,929 before the fix
below). That is far below the real-file figure, and it should be: these
files were written to be hard. The breakdown matters more than the total:

| | Rows | Match |
|---|---|---|
| Files with no resource assignments | 1,775 | 74% |
| Files with resource assignments | 3,424 | 48% |
| Resource-dependent activities | 936 | 17% |

The biggest gap is clear. P6 schedules a resource-dependent activity on its
resources' calendars. Our engine uses the activity's own calendar. On the
six real files the two calendars are the same, so it never showed. A
contractor whose crews work different hours from the activity calendar would
see it. That is now the next item on the engine's list.

## One rule fixed

The start-to-finish rows showed a smaller, exact fault. An As Late As
Possible activity slides later by its free float. When it is under way and
has a start-to-finish link into a successor that has also started, our
engine treated the link as already satisfied and slid the work to the end of
the project. P6 does not. It holds the work so that its remaining start plus
whatever part of the lag is still unspent lands on the successor's finish.
The lag counts from the predecessor's actual start, so time already worked
uses it up. Under progress override the link holds only work that has not
started yet.

With that rule, 24 more rows match and none that matched before stops. The
six real files are unchanged. The rule was read off these probes, so those
24 rows are not an independent test of it. The other 2,929 were not used to
fit anything.

## Relationship dates on start-to-finish links

The run also closed a smaller item. P6 writes two dates on every link that
no screen shows (TASKPRED `aref` and `arls`). The engine already reads them
to find a lag that was edited after the last schedule run. Start-to-finish
links were the one type not decoded. The three in the real files fit the
same shapes as the other types: `aref` is the predecessor's early start plus
the lag, less the successor's duration, and `arls` is the successor's late
finish less the lag and the predecessor's duration. `arls` now agrees on
40,478 of 40,478 links between unstarted activities. Three links is a small
sample. The formulas are the only ones that fit both unstarted links on both
dates, so treat them as a reading, not a law.

The method, the tables and every row that still differs are in
[`eval/p6-probes-2026-11-24.md`](../../ventures/xer-schedule-check/eval/p6-probes-2026-11-24.md).
Anyone can rerun it: `bash eval/corpus-fetch.sh DIR --probes`, then
`node eval/p6-probes.mjs DIR/p6-probes`.

*XER Schedule Check is a free, open-source tool. Its results are estimates
from the file you give it, not professional scheduling, legal or claims
advice.*
