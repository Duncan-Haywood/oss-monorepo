---
title: "Tennis feeder: the looser vote named more short contacts and failed anyway"
seo_title: "Tennis feeder: a looser vote named more short contacts, then failed"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Margin 1 named 85 of 120 short contacts on fresh drills, against 72, but told 3 of 48 instant builds to set a contact time. The margin stays at 2."
---

Earlier today the open tennis-ball feeder's firmware started letting a few
balls vote on how long the launcher wheels hold each ball (the "take").
Only balls whose contact crosses a revolution's edge can see a short take.
On those, a better fit at 1.5 ms than at 0 counts as a vote for 1.5 ms
([the first post](2026-11-19-tennis-feeder-straddling-wheels-vote.md)).
The Pi advises 1.5 ms when the votes for beat the votes against by a
margin. It shipped at 2.

Margin 1 looked better on the held-out sets: 86 of 120 short takes named,
against 71. But we picked it out after looking at those numbers, and on the
design sets it had told one instant build to set a take. So it needed a
test of its own, on data nobody had looked at.

## Writing the test so a rare harm could show

Each standard simulated set has only 3 instant builds, so a fresh pair
gives 6. That is too few to catch a harm that showed up once in 36. Simply
repeating "0" in the take list doesn't help: the same launcher, lag and
seed replay the same drill. So before capturing anything, we committed:

- four fresh standard sets (seeds 191 to 199, wheel lags 0.44 to 0.66 s);
- twelve instant-only captures on fresh seeds, which gives 48 instant
  builds in all;
- a rule. Margin 1 replaces 2 only if it names more short takes, tells
  **no** instant build to set a take, makes fewer than one build wrong per
  five it fixes, and the board's own frame counts match the rebuild.

## What happened

| margin | named (of 120) | instant builds told to set a take (of 48) |
| --- | --- | --- |
| off | 62 | 0 |
| 1 | 85 | 3 |
| 2 (shipped) | 72 | 0 |

Margin 1 named more short takes again, but it failed two of the four
clauses. Three instant builds got "set TAKE_US = 1500", and each had the
smallest split it acts on: two balls for, one against. It also broke 4
builds that margin 2 got right while fixing 14, a ratio of 1 to 3.5 where
the rule asked for better than 1 to 5. The margin stays at 2.

The straddling balls explain it. On an instant build, about one in five
of them votes "for" (11 for, 44 against, pooled). When a drill has only
three such balls, a 2-1 split for an instant take is not unusual. A margin
of 2 needs at least two more votes for than against. No instant build got
there in 48, and none had in the earlier 12 either.

So margin 2 now has a second held-out reading: 72 against 62 named, no
instant build misadvised, and no build it gets wrong that the old rule got
right.

## Still open

Most 1.3 to 2 ms contacts still read as instant (22 of 36 here), because
those drills have too few straddling balls for any margin to act on. A
margin that grows with the number of straddling balls is the obvious next
idea, and it needs its own fresh seeds. All of this is simulated. On a
real machine the first reading will be the two vote bytes in the survey
frame.

Numbers, sets and the rule:
[`eval/take-straddle-margin-one-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/eval/take-straddle-margin-one-2026-11-19.md).
