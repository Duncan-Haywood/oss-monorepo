---
title: "Under progress override, P6 starts the successor at the data date, not the restart"
seo_title: "P6 progress override: SS successors start at the data date"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, critical-path]
description: "A start-to-start successor of work under way, under P6's progress override, is laid from the data date itself. Matching it fixed 92 probe rows and broke none."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a
Primavera P6 schedule in the browser and checks its own dates against the
ones P6 stored. On six public real P6 files it already agrees on 19,908 of
19,935 activities. The harder test is a public set of 338 small probe
projects, each built around one awkward case and scheduled in P6
Professional 23.12 ([danafitkowski/cpp-cpm-engine](https://github.com/danafitkowski/cpp-cpm-engine),
`validation/p6-probes`). There the engine matched P6 on all four dates and
both floats on 3,730 of 5,199 rows this morning.

## The case

Activity A started Wednesday and has two days left. The data date is
Friday at 17:00, the end of A's working day, so A's remaining work restarts
Monday at 08:00. Activity B follows A by a start-to-start link and runs on
a 24-hour calendar.

Where does B start? The engine said Monday 08:00: a start-to-start link
waits for the predecessor's start, and A's remaining work starts Monday.
P6, with the project set to **progress override**, says **Friday 17:00**.
It does the same with a start-to-finish link, and with "lag from Actual
Start" as well as "lag from Early Start".

The reading that fits every probe row: under progress override, a
successor of work under way is laid from the data date itself. Any part of
the lag not yet used up by the data date then runs on from there. A 40-hour
lag that started Wednesday has 16 hours left on Friday evening, so B starts
Tuesday at 17:00, which is what P6 printed. When A's remaining work happens
no longer matters to B, so P6 also stops limiting A's free float at B. It
prints 384 hours, running to the project finish, where the engine printed 0.

Under retained logic P6 does wait for the restart, and the engine already
did that.

## The result

| | Before | After |
|---|---|---|
| Probe rows matching P6 on all six values | 3,730 of 5,199 | 3,822 of 5,199 |
| Rows fixed / made worse | | 92 / 0 |
| Six real P6 files (early finish, late finish, total float) | 19,908 of 19,935 | 19,908 of 19,935 |

I also tested a third rule: under retained logic, count a start-to-finish
link from the restart. One probe row suggested it. It fixed that row and
broke nine others, so it ships switched off. The rules were fitted on these
probes, so this isn't a held-out score. And no public real file has this
setup, so the count on real files couldn't move. It didn't.

## Why a scheduler should care

Free float and the start of the next activity are what an owner's
scheduler checks first when a contractor's update lands, and a data date at
the end of a shift is the usual case. A checker that disagrees with P6 here
prints a different start and free float from the ones in the file, and the
reviewer ends up chasing a difference P6 never made. The method, the probe rows and what's left are in
[`eval/po-ss-data-date-2026-11-24.md`](../../ventures/xer-schedule-check/eval/po-ss-data-date-2026-11-24.md).
The tool runs free at
[marisstella.app](https://marisstella.app/xer-schedule-check/), and
nothing is uploaded.
