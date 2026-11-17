---
title: "Chip design search: a spot-check the schedule already pays for beats no check, narrowly"
seo_title: "A free spot-check for a chip-flow ranking beats no check, narrowly"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "On 90 replayed Yosys and OpenROAD cells, checking a ranking against its own timing pilot cuts mean regret from 4.77% to 4.39%, yet loses on most cells."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule maps every candidate, ranks them by a cheap clipped
score, and pays for place-and-route only on the best 8. On some wide shifters
that ranking misleads, and the rule does far worse than routing random
candidates.

The [last step](2026-11-15-verified-dse-staged-probe-guard.md) checked the
ranking on a random subset before mapping the rest, so a failed check still had
budget for random routing. The check worked, but its six probe routes came out
of the ranking's 8, and that cost 4.2 points on the cells where the ranking was
right.

## A check that costs nothing

The rule already routes one random candidate in full, a timing pilot, to
measure how expensive routing is. This step uses that pilot as the random
probe. The ranking's probe is the best of a random 32 mapped candidates, which
the ranking would route anyway whenever it is in the global top 8. If the
pilot beats it, distrust the ranking and route randomly with what is left. We
wrote the rule and six predictions into the repository before computing
anything (commit 124b3f143), then replayed it on the same 90 cells.

## What came out

When the check passes, the rule routes exactly the unguarded ranking's 8
candidates in 90% to 99% of draws. So the check really is nearly free; what it
costs is its false alarms.

- Mean regret over the 90 cells: 4.39%, against 4.77% with no check, 5.44% for
  random routing and 3.91% for the 32-gate structural rule. It is the first
  measured check in four steps to beat no check on the mean.
- On the 17 cells where the ranking fails, it falls back in 34% of draws and
  cuts regret from 16.63% to 11.83%.
- On the 40 cells where the ranking is perfect, one random candidate beats the
  subset's best in 12% of draws, and those fall-backs cost 1.15 points.
- Cell by cell it is worse than no check on 48 and better on 19. The mean gain
  comes from big wins on a few failing shifters (a 128-bit add-driven shifter
  goes from 23.0% to 13.3%) against small losses on many winning cells, and
  the 95% interval of the difference (-1.13 to +0.34 points) includes zero.

Four of six predictions held. The two that failed were close: false alarms of
0.12 against a predicted ceiling of 0.1, and a cost of 1.15 points on winning
cells against a predicted ceiling of 1. The subset size hardly matters (4.34%
to 4.39% for 16 to 48 points).

## What it means

Three steps narrowed the problem: look at the top of the ranking, look before
the pool is mapped, and use probes the schedule pays for anyway. What is left
is that one random point against one ranked point is a coarse test. The next
step softens the fall-back instead of adding probes: after a failed check,
keep part of the budget on the ranking's next candidates and spend the rest at
random. Then the check has to pass a blind test on shifter families no table
has run.

This is a replay on cells the programme has already seen, so it prices the
rule; it does not test it.

Results: [`experiments/pilot_probe/results.txt`](../../research/verified-dse/experiments/pilot_probe/results.txt).
Log: [`LOG.md`](../../research/verified-dse/LOG.md).
