---
title: "The slow part wasn't where we said: a 3.8x faster break floor for league schedules"
seo_title: "Fast min-plus step for round-robin home/away breaks"
date: 2026-11-13
tags: [ventures, league-schedule-generator, algorithms, performance]
description: "A profile found the league scheduler's real cost; eliminating host bits along paths and cycles made it 3.8x faster, same results, and 22 teams join."
---

The [league schedule generator](https://marisstella.app/) searches for seasons
that trade off two things organisers care about: **breaks** (a team at home, or
away, twice running) and **carry-over** (how unevenly the "who did they play
just before me" effect falls). Since this morning it has priced each timetable
on its *proved* fewest breaks: a dynamic programme over rounds whose state is
one round's choice of hosts.

The last write-up said 19-team leagues spent 35 to 46 seconds in that search
and added nothing, and put the blame on a balance check running out of budget.
**That was wrong.** A CPU profile of the slowest run (143 s) gave the balance
walks under one second. Almost all of the rest went to one line of the
programme:

```
next(y) = min over x of  this(x) + breaks between hosts x and hosts y
```

With k matches a round there are 2^k host choices on each side, so that's a
2^k by 2^k double loop: 262,144 steps a round at 19 teams and 16.7 million at
24.

## The structure the double loop ignored

A break belongs to one team, and a team plays one match a round. So each host
bit of round r interacts with at most two host bits of round r+1: those of the
two matches its teams play next. Draw those interactions and you get paths and
cycles, not a dense mesh.

That means you can get rid of round r's bits one at a time, walking along each
path. You keep a table over the bits not yet removed plus the round r+1 bits
you've met so far, and it never grows much beyond 2^(k+1) entries. The whole
step costs about k × 2^(k+2) additions instead of 4^k popcounts. It's the
textbook variable-elimination idea, applied to a graph that happens to have
treewidth 2.

The table that comes out is the same as the old one, entry for entry. A test
checks this on 300 random round pairs, including byes, teams sitting out and
repeated pairs. Because the numbers are identical, every search follows the
same path and returns the same season.

| One round's step | double loop | elimination |
|---|---|---|
| 9 matches (18-19 teams) | 2.6 ms | 0.12 ms |
| 10 matches (20-21 teams) | 11.5 ms | 0.2 ms |
| 12 matches (24-25 teams) | 203 ms | 0.9-1.3 ms |

## What it changes

- **The same seasons, 3.8x less time.** We re-ran the page's search with the
  old code and the new on the same cached inputs: 15 runs at 16 to 20 teams,
  one at a time, on the same machine. The seasons and the trade-off curve were
  identical in all 15. The time fell from 485 s to 127 s. The 19-team runs that
  add nothing went from 38-134 s to 8-18 s.
- **22-team leagues get the search.** The page used to stop at 21 teams, since
  one 22-team search took 22 to 86 seconds. Now the whole step takes 35 to
  64 seconds at 22 teams, and on all three test seeds it adds one or two
  seasons inside the curve's widest gap, 4 to 10% lower in carry-over.
- **Not yet 23 to 25.** At 23 teams the step found nothing on three seeds.
  At 24 and 25 it does find seasons (up to 18% inside the gap) but takes 2 to
  7 minutes, so those sizes stay off in the page. The remaining cost is the
  same step again (87 s of a 152 s run) plus the balance walk's scan of 4,096
  states per round. A backward table, so that a move reruns only the rounds it
  touches, is the next thing to try.

## The lesson worth keeping

Earlier sections of the README had tuned the balance walk's budget. A smaller
budget "did not help 19 teams", and the measurements were right. Only the
explanation was wrong, and nobody had profiled. One `node --cpu-prof` run would
have settled it. The README now carries the correction next to the claim it
corrects.

Measurements: `ventures/league-schedule-generator/eval/faster-floor.txt`;
write-up: README, "A faster break floor".
