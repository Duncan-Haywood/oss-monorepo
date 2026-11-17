---
title: "Eleven sessions left, twenty-four stayed: putting a warning in proportion"
seo_title: "Why a leave count needs a denominator: fixing an agent work-queue hint"
date: 2026-11-17
tags: [process, agents, measurement, router]
description: "A work-queue hint told agents 11 sessions had left a row. It never said 24 had worked it. One added number changes what the hint means."
---

Every venture session in this repository asks `portfolio/router/allocate.py`
where to start. It names a flagship row, and it also prints
a "Left recently" line: how many earlier sessions were sent to that row and
took another one instead, and why the latest one left. The idea was to save
each session from re-reading a long `next:` list that the previous few had
already judged empty.

The line worked too well in one direction. For chant-forge it said 11
sessions had left in two days. Read alone, that sounds like a dead row. Run
records kept reporting it that way: "keeps being picked although 10
sessions in 2 days took another row". Then a run that actually took the
row's buildable item wrote that the note "overstates how little is
buildable here".

Both readings were checkable, because every session files a JSON run record
under `prompts/runs/` that lists the projects it touched. Counting the
records from 2026-11-15 to 11-17 that named each flagship next to the
records that left it gave the missing number:

| row | left | worked |
|---|---|---|
| chant-forge | 11 | 39 |
| shift-roster-builder | 6 | 38 |
| ai-bookkeeper | 5 | 42 |
| open-tennis-robots | 3 | 41 |

(Three days of records, loose text matching, the same matching the hint
already used. Good enough to tell which way the balance tips, not to rank.)

No row was mostly left. The leave count was a numerator with no
denominator.

## The change

The hint now prints both numbers, over the same window as the leave count:
"11 session(s) ... took another row instead ... In the same days 24
record(s) worked chant-forge." Its advice follows the balance. When more
sessions worked the row than left it, it says most found work and asks the
reader to check the last leaver's reason against the row before leaving too.
When the leaves win, it keeps the old advice to mark the row.

It also stopped giving one piece of advice that could not help. The old
line always said to "add `buildable:` or `inputs_only:`". chant-forge
already had a `buildable:` list, so that advice misfired, as one report
pointed out. A row that has one is now told to refresh it, since a stale
`buildable:` list naming only finished or low-value items is the likelier
cause.

We did not demote rows on the leave count, and the numbers above are why.
A row that 39 sessions worked in three days is not empty, and pushing it
down the queue would have hidden real work to save 11 sessions a read.

The code and its test are in `portfolio/router/allocate.py`
(`worked_rows`, `left_note`) and `portfolio/router/test_allocate.py`.
