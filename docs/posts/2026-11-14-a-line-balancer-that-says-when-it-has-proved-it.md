---
title: "A line balancer that says when it has proved the answer, checked on Scholl's 269 benchmark lines"
seo_title: "Free exact assembly line balancing tool, benchmarked"
date: 2026-11-14
tags: [assembly-line-balancer, ventures, manufacturing, operations-research, research-algorithms]
description: "A free browser line balancer with an exact search. It matched the published optimum on 258 of 269 Scholl problems at 4 s each and says which answers it proved."
---

Balancing an assembly line is a weekly job in many plants and a set exercise in every industrial engineering course. You have a list of tasks, each with a time and the tasks that must come before it, and a takt time from demand. The question is how few stations, and so how few operators, the line can run on. The method most people are taught is a priority rule such as ranked positional weight: fill each station with the heaviest ready task that fits, then open the next one. It is quick, often right, and sometimes a station or two over, and nothing tells you which case you are in.

The new [assembly line balancer](https://marisstella.app/assembly-line-balancer/) runs those rules first, then an exact search, and tells you which kind of answer you got. "5 stations is the fewest possible at this cycle time (proved)" means the search has ruled out 4. "Best found: 52 stations, at least 50 are needed" means it ran out of time and is telling you how wide the gap is. It also answers the other question, the shortest cycle with the stations you have, and it runs entirely in the browser.

## How the exact search works

It starts from lower bounds: total work over the cycle time; tasks longer than half the cycle, which cannot share a station; and the work each task must wait for. Then it asks whether the lower bound is achievable, and if not, the next count up. The first count it can achieve is the optimum.

Each yes-or-no question is a search that fills one station at a time. It tries only maximal loads, ones to which no ready task still fits, which Jackson showed in 1956 is enough. A target of *m* stations allows a fixed total of idle time, and any load that would overspend it is dropped. Every set of placed tasks is remembered, so a set reached a second time is skipped, whatever order the earlier stations were filled in. States are explored one station level at a time, least idle first. That is the idea of Sewell and Jacobson's 2012 "branch, bound and remember" algorithm, in a simpler version written here from the paper. Half the budget searches the line backwards from the last station, after Scholl and Klein's SALOME, because some lines are much easier to fill from the end.

## How it did

Armin Scholl's 1993 data set is the standard test: 269 type 1 problems on 25 precedence graphs from 7 to 297 tasks, with the optima published on [assembly-line-balancing.de](https://assembly-line-balancing.de/). A script reads the published zip, runs every problem at the page's default limit of 4 seconds, and checks every balance with code separate from the solver.

| At 4 s per problem | Type 1 (269) | Type 2 (302) |
|---|---:|---:|
| Same answer as the published optimum | 258 | 256 |
| Proved optimal by this engine | 249 | 251 |
| Worse than the published optimum | 10 | 42 |
| Better than the published optimum | 0 | 0 |

The misses are on the hard graphs: Scholl's own 297-task line, Barthol2 and Wee-Mag. On every miss the page says "best found" and gives the proved bound rather than claiming an optimum. One Wee-Mag problem is still listed as open in the literature, between 32 and 33 stations; the engine finds 33 and cannot close it either. Published exact methods do better on those graphs. What matters for a user is that the tool is honest about which answers are proved.

Getting there took three versions, and the failures were instructive. A plain depth-first search with memory matched 217 of 269 at half a second each. It got lost on lines with many small tasks: Barthold at cycle 403 has just 8 units of idle time to spread over 14 stations, and listing every way to fill the first station used the whole budget. Switching to best-first search alone made it worse (209), because it still expanded each state completely. What fixed it was taking a few loads from a state at a time and coming back for more later, together with a bound that stops building a load once even the tasks that could still join could not fill the station, and numbering the tasks so the heaviest positional weights come first. That reached 242 at half a second and the numbers above at 4 seconds.

On small lines there is a stricter check. On 300 random lines of up to 11 tasks, the station count equals a brute-force search over every precedence-feasible station load. That holds with the heuristics, with the exact search alone, and with the exact search run backwards alone.

## What it does not do

This is the simple problem: one product, fixed times, one operator per station. Zoning (tasks that must or must not share a station), parallel stations, mixed models, task time variation and ergonomics are not modelled, and on a real line they often decide the answer. Those are the obvious next steps, and the search extends to most of them. Until then, treat the result as a floor and a first layout.

The code is MIT licensed, with a CLI (`node cli.mjs tasks.csv --cycle 60`) and an `analyze()` entry point for agents. The [how-it-works page](https://marisstella.app/assembly-line-balancer/how-it-works.html) has the method and the benchmark summary; the per-problem tables are in the repository.
