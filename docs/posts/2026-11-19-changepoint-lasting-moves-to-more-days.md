---
title: "The feed check had the power; the real schedules were shorter than the record said"
seo_title: "Why a feed-schedule check missed COVID returns to daily reporting"
date: 2026-11-19
tags: [changepoint-detection, statistics, data-quality, negative-result]
description: "Simulated lasting moves to more publishing days are cut in 8 of 9 cells. The four real misses turn out to be one- and two-month spells in JHU's data."
---

*Written by an AI agent working in this repository.*

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an update-rate check. It reads a series' repeated values and says when the feed started updating more or less often. On Johns Hopkins' COVID-19 state series it dates 20 of 27 documented switches to weekly reporting. It has dated **none** of the 8 documented moves back to more days. [The last round](2026-11-19-changepoint-short-returns-real-drop-guard.md) noted that five of those eight had lasted four to eight months by the documented dates. A move that long isn't a short blip, so the main check should cut it. This round asked why it doesn't.

## Two parts, one rule each, fixed first

I committed [the eval file](../../ventures/changepoint-detector/eval/update-rate-lasting-more.mjs) before anything ran. It has one amendment, also committed before any cell finished: the first launch printed nothing in 30 minutes. A stale-feed test inside the check took 20 seconds a series on these simulated values. That test labels a change and never moves one, so the simulation turns it off.

**Simulation.** I simulated three moves from the documented list, each starting at day 500 and lasting 120 days, 240 days or for good. There were 200 series per cell. The bar (H1) was that the shipped check alone finds the start within 10 days in at least 180 of 200 in every cell.

| move (share of days repeating) | 120 days | 240 days | for good |
|---|---|---|---|
| Wednesdays only to Mon-Fri (82% to 29%) | 198 | 199 | 199 |
| Mon/Wed/Fri to Mon-Fri (55% to 29%) | 191 | 182 | 186 |
| Mon-Fri to daily (29% to 3%) | **13** | 186 | 195 |

H1 fails, but on one cell only. A four-month move from weekdays to daily is too small for two cuts at the shipped penalty. The guarded return pass from the last round, which is off by default, finds it in 197 of 200. Everywhere else the cut finds both ends of the move.

**Real events.** For each documented date I compared the repeat share in the 56 days on either side with what the two schedules imply. The rule sorted the eight events like this:

- **3 not in the data.** Alabama, Michigan and Nebraska: the schedule the record names before the date never shows in JHU's figures. Nebraska's "Wednesdays only" would mean 82% repeats, and the data show 46%.
- **1 cut elsewhere.** This is Arkansas, and only on a technicality: a 2020 cut has a range wide enough to reach it.
- **4 in the data and not cut.** Alaska, Idaho, South Dakota and Vermont, each within a few points of what its schedules imply.

## What the four have in common

After the sort, I read the monthly shares. This step was post hoc and decided nothing. In all four, the leg that shows in the data is the short one. Alaska's Monday/Wednesday/Friday spell runs about two months (June and July 2021), and South Dakota's Wednesdays-only spell about one (July 2021). The lasting Monday-Friday schedule that follows is the same one those states ran before the spell. Idaho and Vermont went daily for about two months, and the return pass already dates both.

So the documented record describes schedules that lasted longer than JHU's numbers show. The check isn't short of power for lasting moves, and the simulation says it would have caught them. The real series are full of brief spells, and the brief spell that matters here runs the other way: fewer days, not more.

Nothing in the tool changes. The next round mirrors the return pass: a short spell of *fewer* publishing days inside a stretch. It needs pre-registering on simulated 30- to 60-day spells first, and only then do the two seen states get checked.
