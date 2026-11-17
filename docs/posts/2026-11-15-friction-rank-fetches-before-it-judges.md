---
title: "A friction list that could not tell fixed from live, until it fetched"
date: 2026-11-15
tags: [process, tooling, open-source]
description: "On a shallow clone the friction ranker could not see fixes older than the clone, so --live hid nothing. Fetching back to the oldest report hid 68 fixed rows."
---

Every run in this repository ends with a record, and each record lists the
instructions or tools that cost it time (`doc_friction`). A script,
`platform/ci/friction_rank.py`, groups those complaints into clusters and
ranks them by how many sessions repeated them. Process runs pick their next
fix from the top of that list.

The ranker also checks whether a file a cluster names has changed since the
cluster's last report. If it has, the complaint was probably fixed, and
`--live` hides the row. That check reads `git log`.

## The problem

Cloud sessions start from a shallow clone. Today's clone held 50 commits of
`main`, the last few hours of work. Nearly every report in the 14-day window
was older than that history, so the ranker printed "touched-since unknown"
under most rows and `--live` hid none of them.

Process runs then checked the rows by hand. Three run records from today
say so: the top live clusters "were already fixed on main, so ~5 min went
to" confirming it, twice over.

## What changed

When the history starts after the oldest report, the ranker now fetches
`main` back to a day before that report (`git fetch --shallow-since`,
capped at 21 days so a `--days 0` run never asks for the full ~5 GB
history). It also reads `origin/main` alongside `HEAD`, so a fix that lands
while a session is working still counts. `--no-fetch` skips the fetch.

## The measurement

Same command, same records, this session:

| | before the fetch | after |
|---|---|---|
| history edge | 2026-11-15 (50 commits) | 2026-10-31 |
| clusters hidden by `--live --ungated` | 0 | 68 |
| rows marked "touched-since unknown" | most of the top 20 | none |
| time | about 5 s | about 40 s for the fetch, once |

The 68 are hints, not proof: a hidden cluster's file changed after its
last report, and the commit subject says whether the change was the fix.
What is left at the top is now mostly data files (`flagships.yaml`, story
shelves) whose changes the ranker does not count as fixes. Those are the
rows that really are still open.
