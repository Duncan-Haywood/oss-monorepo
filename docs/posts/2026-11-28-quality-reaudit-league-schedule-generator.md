---
title: "Re-audit: the league schedule generator meets the bar, and a double round robin can have a third fewer breaks"
seo_title: "Double round robin breaks: mirrored 3(n−2) vs reversed 2(n−2)"
date: 2026-11-28
tags: [quality-audit, evaluation, scheduling, league-schedule-generator]
description: "Re-check of the League Schedule Generator: 7 of 8 earlier defects closed, 1,029 tests green, 5 of 5 seeded bugs caught. It now meets the quality bar."
---

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/)
builds round-robin seasons for rec leagues in the browser. Its
[2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-league-schedule-generator-r87.json)
found eight defects and scored it below the bar on two dimensions: claims (2)
and craft (2). This re-audit checked every one of the eight against today's code.
The result is in
[`2026-11-28-league-schedule-generator-reaudit.json`](../../portfolio/quality/audits/2026-11-28-league-schedule-generator-reaudit.json).

**Verdict: it meets the bar** (correctness, claims and verification all 3, and
every dimension 3). It is the first time in five audits.

## What was wrong, and what we found today

| earlier defect | today |
|---|---|
| The README claimed "the minimum possible breaks" for a double round robin, but the mirrored second leg has 3(n−2) | closed: the claim is qualified, and an option to play the return leg in reverse order gives 2(n−2) |
| Head-to-head tie-breaks ignored volleyball set scoring (a 3-2 win counted as a full win) | closed: recomputed, B 5 v A 4 under FIVB points, as the league's own table would rank them |
| Americano sit-out credit rounded the average before multiplying | closed |
| The leaderboard tie-break order was untested | closed: a seeded swap now fails a test |
| README test command did not run under Node 22 | closed |
| A browser check could read the previous build's table | closed |
| `calc.mjs` was a 4,149-line monolith | partial: now 15 modules behind a 53-line entry point, but the README has grown to 6,639 lines of experiment log |
| Sitemap and `llms.txt` hosts in source | closed: still rewritten correctly at deploy |

## The numbers, recomputed outside the author's tests

Each of these comes from
[`eval/reaudit-2026-11-28.mjs`](../../ventures/league-schedule-generator/eval/reaudit-2026-11-28.mjs),
which counts breaks with its own code rather than the tool's `countBreaks`:

| teams | single | mirrored double | reversed double |
|---|---|---|---|
| 6 | 4 | 12 | 8 |
| 8 | 6 | 18 | 12 |
| 12 | 10 | 30 | 20 |
| 5 or 7 (odd) | 0 | n − 2 | 0 |

A break is two home games or two away games in a row. The single round robin
sits at the proven minimum of n − 2 for an even league. Reversing the return
leg cuts a double's breaks by a third. The cost is that the pairs who close the
first half meet again the very next week. That is why the tool offers it as an
option rather than making it the default.

All 1,029 tests pass (261 s), and all five seeded bugs were caught, the
tie-break swap that survived last time included.

## Fixed in this round

Two small documentation gaps, each with a test:

- The [home and away guide](https://marisstella.app/league-schedule-generator/how-to-balance-home-and-away-games-in-a-round-robin.html)
  explained the mirrored double but did not mention the reversed leg the tool
  has offered since 2026-11-20. It does now, in the page and its FAQ markup.
- A code comment said an odd league's mirrored double has n breaks. It has
  n − 2.

## Not at the bar yet

Fitness was walked through the module API, not the browser, this round. The
README is now a 6,639-line lab notebook. A commissioner looking for how to use
the tool has to scroll past hundreds of dated experiments. That is logged in the
venture's `NEXT.md` as a split into a user README and a history file.
