---
title: "Fixing a call-out without reshuffling 40 people"
seo_title: "Changing a posted schedule after a call-out without reshuffling everyone"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "Rebuilding a posted week after one call-out moved 603 shifts across 24 call-outs on 40-person teams. Keeping the posted shifts cut that to 124, and starting the search from the posted roster cut it to 40."
---

Someone calls out for tomorrow. You mark them off and build the week again. The scheduler finds a good roster, but it isn't trying to find one close to the roster you already posted. So it moves other people around, and under a predictive-scheduling rule each of those moves can owe a premium.

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to reissue a posted week: shifts that have already started stay put, and every posted shift someone keeps counts in the score. On two invented cafés that halved the changes to other people. This run checked whether the gain holds on bigger teams.

## Bigger teams, bigger reshuffles

Here are changes to people other than the caller, summed over the call-outs (Wednesday onward, with the change made at 5pm the evening before):

| Team | Free rebuild | Keeping posted shifts | Plus the new kept start |
|---|---|---|---|
| 4 built-in templates (56 call-outs) | 162 | 73 | 73 |
| 20 people (24) | 253 | 26 | 26 |
| 30 people (24) | 507 | 50 | 50 |
| 40 people (24) | 603 | 124 | 40 |
| 60 people (24) | 1,623 | 973 | 60X168_AFTER |

Every column leaves the same number of hours open. Keeping the posted shifts never cost coverage.

A free rebuild gets worse as the team grows: at 40 people, one call-out moves about 25 other shifts on average. Up to 30 people, keeping the posted shifts brought that down to one or two. At 40 and 60 people it didn't work as well. Two Wednesday call-outs on one 40-person week still moved 37 and 39 shifts, while their neighbours moved 7 or 8.

## Why, and the fix

The search builds every roster from scratch. On a small week the exact check then proves the best roster, and the best roster is the one close to what you posted. On a big week the exact check runs out of time, so what you get is whatever the quick search found, and it started nowhere near your posted roster.

So now, when there's a roster to keep, the builder also starts from that roster. It gives each shift back to whoever had it if the rules still allow that, fills the gaps as cheaply as it can, then polishes. It keeps whichever start scores better. On those four 40-person Wednesday reissues the changes fell from 91 to 7, with the same open hours and $136 less pay. Below 40 people nothing changed, because those weeks were already proven.

## What we can't tell you

These teams and weeks are invented, and the seeded weeks sample four call-outs a day. Whether a premium applies to you, and what it is, depends on your local rules. You enter those yourself, and the tool doesn't check any ordinance. At 60 people a reissue still moves far more shifts than at 20, and we haven't checked whether all those moves are needed.

The code, tests and full output are in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (`eval/reissue-scale.mjs`). The tool is free, runs in your browser and needs no sign-up. Its numbers are estimates from your own team and rules, not legal or staffing advice.
