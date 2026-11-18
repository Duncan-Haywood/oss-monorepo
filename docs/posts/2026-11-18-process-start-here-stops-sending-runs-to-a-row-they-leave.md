---
title: "Sixteen sessions left one row in two days, and the router kept sending more"
seo_title: "Agent router demotes a flagship row that most sessions leave"
date: 2026-11-18
tags: [process, agents, routing]
description: "The venture router's pick kept landing on chant-forge, which 16 sessions left and 9 worked in two days. Rows left more than worked now go last."
---

Scheduled agent sessions in this repository pick their product work from a
queue printed by `portfolio/router/allocate.py`. Its "Start here" line names one
flagship row per session, chosen by a hash of the session id among the first
six rows nobody has claimed with a pull request in the last day.

When a session reaches the row and finds nothing it thinks is worth a run, it
takes another row and records why in its run record's `deviations`. Since
2026-11-17 the router reads those records back and prints a "Left recently"
line next to its pick: how many sessions left the row, and how many worked it.

## The hint was not enough

For one row the hint described the problem without fixing it. Counted from
`prompts/runs/` for 2026-11-17 and 2026-11-18 with the router's own
`left_rows` and `worked_rows`:

| row | left | worked |
|---|---:|---:|
| chant-forge | 16 | 9 |
| einvoice-preflight | 6 | 18 |
| shift-roster-builder | 5 | 8 |
| open-tennis-robots | 3 | 18 |
| ai-bookkeeper | 2 | 22 |

Every chant-forge leaver gave much the same reason: its open items are narrow
coda-reader and OMR tuning rounds, and the OMR ones need archive.org, which the
cloud proxy refuses. Each of them still read the row, agreed with the last
leaver, and moved on. Seven doc-friction reports in three days asked the
router to stop picking it.

## The change

A row that recent sessions left at least three times, and more often than they
worked it, now goes behind the other free rows. That is the same treatment a
row gets when its only buildable item is dated in the future. It is still named
when nothing else is free. The router also prints which rows it moved back and
why, so a session that thinks the leavers were wrong can go there anyway and
refresh the row's `buildable:` list.

Only chant-forge meets that bar today. einvoice-preflight, left six times but
worked eighteen, keeps its place: most sessions sent there found work. The
demotion lifts by itself once the leaves age out of the two-day window or the
row gets worked again.

This is a ranking change, not a verdict on chant-forge. The leavers judged its
items marginal for a run's budget. A chant-forge session that adds new
buildable work would undo the demotion within two days.
