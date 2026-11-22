---
title: "Which critical activity is worth speeding up? Critical path drag on six real P6 schedules"
seo_title: "Critical path drag for a Primavera P6 schedule, free in the browser"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, critical-path]
description: "XER Schedule Check now computes critical path drag and drag cost from a P6 XER. On six public schedules, most critical activities turned out to have none."
---

When a job is late, someone asks what it would take to win the time back.
The schedule shows a critical path, and every activity on it has the same
total float, usually zero. Float says these activities matter. It doesn't
say which one is worth paying overtime on.

[XER Schedule Check](../../ventures/xer-schedule-check/) now answers that
with **critical path drag**. Stephen Devaux defined it in *Total Project
Control* (1999): an activity's drag is how much earlier the project would
finish if that activity took no time, with everything else left as it is.
It is the most that speeding up that one activity can ever win. Neither
Primavera P6 nor Microsoft Project computes it.

## How it is worked out

You can do it by hand in P6. Set one critical activity's remaining
duration to zero, reschedule, write down the new finish, undo, and repeat
for every activity. The tool does exactly that, in the browser, using the
same scheduling engine as the rest of the tool. That engine handles
calendars, lag calendars, SS/FF/SF links, constraints, progress and
retained logic. It runs once for each activity on the longest path and
once for each lag between them. Type a cost per calendar day of finish
(liquidated damages, extended site overheads) and each row also gets a
**drag cost**.

Rescheduling also catches two things a float formula can miss:

- **Reverse drag.** The critical path can enter an activity at its finish
  (a finish-to-finish link) and leave from its start (a start-to-start
  link). Shortening that activity moves its start *later*, so the project
  finishes later. The tool flags these rows.
- **Stepped gains.** On real calendars, shortening an activity by its drag
  doesn't always win the whole drag. The tool reports the smallest
  shortening that does.

## What six public schedules show

I ran it on the six public P6 files the tool is tested against
(`eval/drag-check-2026-11-22.md` in the repository):

| File | Longest-path activities | With drag |
|---|---|---|
| CCA (19,822 activities) | 54 | 4 |
| Expressway | 31 | 1 |
| Demo file | 13 | 12 |
| Hotel | 130 | 2 |
| Wind farm sample | 30 | 30 |
| Airport terminal | 33 | 1 |

In four of the six files, almost nothing on the critical path has any drag.
The airport terminal has 33 activities on the longest path, but parallel
chains of the same length run alongside them. Shorten any one of those
activities and the chain next to it still sets the finish. Only one
activity, an excavation, holds the finish back, and only by a day. If a
manager picked the longest critical activity and added a second crew, the
finish would not move at all.

Reverse drag shows up in real files too. Two activities in the hotel
schedule are linked FF+600 h in and SS+408 h out. Take either one to zero
duration and the finish moves 111 or 117 working days **later**. That says
more about the logic than about the work, and it's the kind of link a
reviewer should ask about.

On the CCA file, one bracket activity on level 12 (T12CO04403C0) has 14.7 hours of drag.
Shortening it by 14.7 hours wins only 8 hours. It takes 22.8 hours of
shortening to win all 14.7, because its finish-to-finish successor lands on
day boundaries.

## How it was checked

To check the tool, I built 200 random networks (2,477 activities) and
computed the right answer with a ten-line longest-path calculation that
shares no code with the scheduling engine. The tool's drag matched it on
all 2,477. On the six real files, shortening each activity by exactly its
drag moved the finish by exactly that much for 47 of 50 activities. The
three exceptions each have a known cause: an expected finish date that
overrides any shorter duration, an activity on a different calendar from
the project, and the stepped gain above. The tool says which applies on
each row. No commercial drag calculation has been compared yet, because
none is public for these files.

There's a step-by-step [guide to finding critical path drag in a P6
schedule](../../ventures/xer-schedule-check/how-to-find-critical-path-drag-in-a-p6-schedule.html),
and the command line is `node cli.mjs schedule.xer --drag --drag-cost 12500`.
Your file is read and rescheduled in your browser tab and never uploaded.
