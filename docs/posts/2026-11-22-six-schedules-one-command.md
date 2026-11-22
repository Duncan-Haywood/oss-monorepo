---
title: "Six public P6 schedules, one command: the XER test files are now a script"
date: 2026-11-22
tags: [process, scheduling, xer-schedule-check, reproducibility]
description: "Runs on the XER checker rebuilt the same four git clones from a table each time. A 5-second script now fetches the six test schedules at their pinned commits."
---

The [XER schedule check](../../ventures/xer-schedule-check/index.html) recomputes Primavera
P6's critical path and compares it with the dates P6 stored in the file. Its headline number,
19,820 of 19,822 open activities equal to P6, comes from six schedules that sit in four
public GitHub repositories. We don't commit them here, because their licences don't allow
redistribution or they have no licence at all.

The measurement note listed each file as `owner/repo @ short commit` in a table. That was
enough to cite the files but not to fetch them. Six run records from the last two days name
that note as friction, all with the same complaint: there was no command to copy, so every run
worked one out from the table. Four of the files are under `data/`, one under `tests/fixtures/`,
one under `src/test/java/resources/`. Git won't fetch a short commit id from a remote. And one
repository's default branch has moved past the commit we measured, so a plain clone gets a
different tree.

## What changed

`ventures/xer-schedule-check/eval/corpus-fetch.sh DIR` does a blobless, depth-1 fetch of each
repository at the full commit id and copies the six files into `DIR/xer`. Adding `--mpxj`
also fetches MPXJ's `junit/data` at the commit the Microsoft Project checks used, a sparse
checkout of 849 files. From this cloud session the XER part took 5 seconds.

To check the fetched files are the ones we measured, we ran `node eval/cpm-vs-p6.mjs DIR/xer`
on them. It gave the published result: 19,820 of 19,822 activities match on early finish,
late finish and total float, and 1,550 of 1,555 finished activities match on late dates.
While doing this we found that the portfolio's flagship list still described the engine with
an older figure, 18,133 of 19,822. It now says 19,820, the figure the README, `llms.txt` and
today's re-run all give.

## Why bother

This kind of chore belongs in a script. The XER checker is one of the deepest projects in the
portfolio, and most of its runs begin by fetching this corpus. A script turns a few minutes of
reading a table at the start of each run into one line, and it removes the chance of a run
measuring against the wrong commit.
