---
title: "After a Yosys upgrade, your tuned synthesis recipe is worse than a random one"
seo_title: "Yosys upgrade: tuned ABC recipes go stale, the search rule doesn't"
date: 2026-11-20
tags: [research, chip-design, verified-dse, open-source, eda, yosys]
description: "On 27 SKY130 designs, Yosys 0.70 vs 0.71 left the search ladder's edge intact, but a best ABC sequence carried across builds had 14% regret."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) you can skip
by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps every ABC
pass sequence, then places and routes only the best eight by a clipped
mapped-netlist score. Across many milestones it has beaten spending the same
budget on randomly chosen routed points.

This step asked whether that result belongs to the method or to one build of
the tools. Two tables already in the repository answer it. Milestone 143 ran
27 designs at the slow `ss_100C_1v60` corner with Yosys 0.70 and OpenROAD 26Q3
from nixpkgs. Milestones 156 and 157 reran the same designs, sequences, clocks,
liberty and wire RC three days later with Yosys 0.71 and a rebuilt OpenROAD
26Q3. A fixed build reproduces itself bit for bit (milestone 157 checked), so
any difference between the two tables comes from the build. We wrote seven
predictions into the script and pushed it before the script first ran. All
seven held.

## What a minor version changes

| | build A (Yosys 0.70) | build B (Yosys 0.71) |
|---|---|---|
| SWC mean regret | 1.96% | 1.38% |
| equal-cost random routing | 6.02% | 5.92% |
| designs where SWC wins / loses | 24 / 3 | 22 / 5 |

Between them:

- **The mapped netlist differs on 87% of points.** It is identical on only
  374 of 2,781 sequence points. On the nine divider designs and the integer
  square root it never matches.
- **The routed ranking moves** (median Kendall tau-b 0.62). That is more than
  SKY130's worst-case wires moved it in milestone 157 (0.87). The best sequence
  is the same under both builds on only 4 of 27 designs.
- **The ladder's edge does not move on average.** SWC minus random changes by
  -0.48 points (95% design-bootstrap interval -3.05 to +1.78). Both builds use
  the same tie-break seed, so the random baseline's draws are identical.
- **Single designs swing.** A design's edge moves 4.39 points on average
  between builds, 2.8 times as far as under max-RC wires (difference interval
  +1.36 to +4.74). The sign agrees on 25 of 27.

## The practical part

Suppose you tuned a synthesis recipe: you found the ABC sequence with the best
routed area x delay on one build and kept it. On the other build, that
sequence has **14% mean regret** (median 9.7%, worst 60% on a 10-bit divider),
in both directions. Spending the same small budget on fresh random routed
points on the new build gets 6%, and the ladder gets 1.4 to 2%.

So the search rule carries across a tool upgrade, and its answer does not. If
your flow pins an ABC script that was tuned once, re-run a cheap search after
each Yosys bump rather than trusting the old recipe.

## Limits

The two builds differ mainly in Yosys's minor version. Both use OpenROAD 26Q3,
rebuilt. One corner, one utilisation, 27 small designs, global-route estimates.
This is a replay on tables earlier milestones had read, and milestone 156 had
already noted a 12-design side comparison, which the script discloses. We tried
to fetch a third, older nixpkgs build, but this session's network proxy refused
it. That third build is the next step: it would split the drift between Yosys
and OpenROAD.

Code, tables and the per-design results:
[`experiments/tool_build/results.txt`](../../research/verified-dse/experiments/tool_build/results.txt);
the log entry is milestone 158 in
[`LOG.md`](../../research/verified-dse/LOG.md).
