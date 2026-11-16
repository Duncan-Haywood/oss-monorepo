---
title: "A 41-team league, 13 nights of 14 wait-free, and a search that can pick up where it stopped"
seo_title: "Wait-free schedules for a 41-team league: 13 of 14 nights"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "A neighbourhood search got 41 teams on 7 courts to 13 of 14 wait-free nights. Two fixes made that possible: the search keeps its own layouts and can resume."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to give every team a **wait-free** night: three games back to back, then
home. For odd leagues on nine time slots that takes a stored design, found
offline by a SAT-based search. Earlier today that search solved 29 teams on 5
courts and 35 on 6. The next size of the same kind, 41 teams on 7 courts
(60 matches in 63 slots), went nowhere. The earlier attempt sat at 1 good night
of 14 and never accepted a step.

This run got it to **13 of 14**. It did not finish the last night, so the tool
still schedules 41 teams with some waits. But the search now gets far, and it
can carry on in a later session.

## What was in the way

The search holds a whole round robin and repeatedly "re-deals" two nights.
It hands the pairs of those two nights to a SAT solver and asks for a new deal
in which at least one more night lays out with no waits. The solver has to
find those layouts to answer yes. The script then threw them away and laid
each night out again from scratch, with a 20-second limit. At 41 teams that
second solve often timed out, and the step was rejected even though the solver
had just proved it good.

Keeping the solver's own layouts fixed it. Four fresh runs climbed from 1 good
night to 9, 10 and 11 in under four hours. The whole season is still checked
once more before anything is stored.

## A search that survives the session

Four hours is about what one session can spend, and 41 teams needs more. So
the search now saves its state after every accepted step: the round robin, plus
the layout of every good night. `--resume` starts a new run from that file.

The first version saved only the rounds. On resume it re-solved each night
under the same 20-second limit, and 11 good nights came back as 9 or 10. Now
it saves the layouts and re-checks them match by match, which takes no
solving. A night with no stored layout gets a longer check (180 s). Resuming a
new random seed from the best state is how the run climbed from 11 to 13.

| Run | Path | End |
|---|---|---|
| fresh seeds 1, 3, 4 | 1 good night at ~250 s | 10, 9, 11 of 14 at 3.9 h |
| seed 8, resumed at 11 | 13 at 1.7 h | 13 of 14 |
| seeds 11-13, resumed at 13 | no gain in 80 min each | 13 of 14 |

In the last three runs the bad night moved around (night 4, 2 and 5). That
hints that no single night is impossible and the last step needs more room,
such as freeing three nights at once instead of two.

## What is in the repository

- `eval/odd-lns.py`: the repair keeps its layouts; new `--save`, `--resume` and `--resume-check`.
- `eval/lns-states/41-7x9.json`: the 13-of-14 state, ready to resume.
- `lns-state.test.mjs`: an independent check in Node. It confirms the state is
  a round robin and that each stored night lays out with every team's games
  back to back, at most 7 games a slot.
- `eval/odd-lns.txt`: every run's timeline.

The next run starts from 13, not from 1.
