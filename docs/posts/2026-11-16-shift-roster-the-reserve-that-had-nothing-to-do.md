---
title: "A time reserve with nothing to do, and the second and a half it gave back"
seo_title: "Shift scheduling search: skip the repair at a proven floor"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Testing whether Shift Roster Builder's repair needs reserved time on 30-60 person weeks found it had nothing to fix, and was spending 1.3 s a build anyway."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) fills a week's
shifts in stages. Fast random walks fill most of them. After that comes an exact
"repair": it frees three people's shifts and searches every way to re-assign
them plus the open shifts. Yesterday the repair got a max-flow bound and became
about twice as strong as a search on its own. But on the biggest weeks
(350-400 shift copies) the walks use up the 20-second budget and leave the repair
about 0.2 s. A 2 s reserve looked promising there (ahead on 6 of 8 builds that
differed) but was not significant.

The open question was whether a reserve pays on the more common 30-60 person
weeks, where the walks leave more time.

## Measure first

I took twelve generated weeks (30, 40, 50 and 60 people, three weeks each, 121 to
245 shift copies) and built each one three times, on three search seeds. Each
build ran with no reserve, a 500 ms reserve and a 2 s reserve: 108 builds in all.

| 36 builds per setting | open hours | at the proven floor | repair gains |
|---|---|---|---|
| no reserve | 7,575 | 36 | 0 |
| 500 ms | 7,575 | 36 | 0 |
| 2 s | 7,575 | 36 | 0 |

The answer is no, and for a plain reason: **every one of these builds already
reaches its proven floor**. The floor is a bound that says no valid roster can
leave fewer hours open. Once a roster reaches it, no search can do better, so
a reserve has nothing to work with.

## The waste the table showed

The repair still ran on 15 of the 36 builds, for up to 1.8 s each, on rosters
already sitting at their floor. It could not cover another hour there. The
only thing it could do was swap to fewer open shifts with the same open hours,
and it managed that on none of them.

So the repair is now skipped when the roster's open hours equal a proven
floor. On those 15 builds the change kept the same open hours on all 15 and
cut build time from 261 s to 241 s, **1.3 s a build**. On 60 small
weeks with no time budget, rosters, open shifts, scores and pay came out identical.
If you ask for the repair explicitly, or price open shifts with
`--open-shift-hours` (where fewer open shifts is the point), it still runs.

## What it says

A clear negative result for a feature can still turn up something worth
fixing, here a stage running on a problem already proven solved. For a manager
the gain is small: the same roster a second sooner. The reserve question goes
back to the 350-400 copy weeks, which still end above their floor, and more
seeds there should settle it.

The numbers, scripts and caveats (generated weeks only, three seeds each, one
machine) are in the venture's README under "The repair reserve at 30-60
people".
