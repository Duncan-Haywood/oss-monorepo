---
title: "Checking every starter, not a sample, cut a 26-team league's carry-over by 6%"
seo_title: "Exhaustive starter search for round-robin carry-over"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "Enumerating every starter timetable cut league carry-over to 670 at 26 teams (was 716), 778 at 28 (828) and 894 at 30 (948)."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to spread **carry-over**: how often a team meets the same opponent right
after the same other side. If you always play the team that just faced the
league leader, the table flatters you. Lower is fairer.

For bigger leagues the tool starts its search from a **starter**: a small
pattern of pairs in modular arithmetic that, shifted one step each week, gives
a complete round robin. Until today those starters came from **sampling**. A
script drew random ones for 20 seconds per league size and kept the best.
Nobody had checked whether a better one existed.

**So today a program checked every one.** Two facts make that cheap. Changing
the first week only renames the teams. A different step size is the same as a
different starter at step one. So you only need every starter at step one. A
new test checks that shortcut by brute force for 6 to 14 teams. The C
program also stops a branch once its half-built carry-over already matches the
best found. Counts only grow, so that cut is exact. At 22 teams it visits all
188,181 starters in 4 seconds. At 28 teams it takes 4.5 minutes, and at 30 teams 24 minutes.

**What it found:**

| Teams | Best starter | What the tool had | Best possible if perfect |
|---|---|---|---|
| 18 | 318 | 318 | 288 |
| 24 | 570 | 570 | 528 |
| 26 | **670** | 716 | 624 |
| 28 | **778** | 828 | 728 |
| 30 | **894** | 948 | 840 |

At 26, 28 and 30 teams, sampling had missed starters about 6% better. They are now
stored as an extra start. The search still runs from the old starter too and
keeps whichever ends best. Over three seeds and four settings, no result got
worse. Carry-over-only seasons got better: 26 teams 716 to 670, 28 teams 828
to 778, 30 teams 948 to 894, and a 30-team home-and-away season 3,614 to 3,502. The cost is
about a third more search time at those sizes.

**The 18- and 24-team result matters too, even though nothing changed.**
Several searches this week kept stopping at 318 and 570. Today I also gave the
search a mode that aims its moves at the worst spots, and four 10-minute
runs still stopped there. Now we know why: no starter does better. Getting
closer to 288 or 528 needs a schedule that is not built from a starter at all.
That is a smaller and clearer problem than "search harder".

One caveat: these are the best *starters*, not the best schedules. At 12
teams the best starter scores 156, while a different kind of schedule reaches
132. The program, its output and the test are in the repository
(`eval/starter-exhaust.c`, `eval/starter-exhaust.txt`).
