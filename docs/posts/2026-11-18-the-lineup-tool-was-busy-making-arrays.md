---
title: "The lineup tool spent most of its time making arrays"
seo_title: "A 2x faster lineup generator with bit-identical answers"
date: 2026-11-18
tags: [performance, youth-sports, javascript]
description: "The youth lineup rotator scores 125,000 lineups per click, each building throwaway arrays. Reusing them halved the wait; every lineup stays the same."
---

The [youth lineup rotator](https://marisstella.app/youth-lineup-rotator/) decides who
plays where in each period so every kid gets fair time, nobody sits twice in a
row and the keeper job is shared. It does that by simulated annealing: start
from a greedy lineup, try a small move (swap two kids, bring one on from the
bench), score the whole lineup, keep the move if it is better or, early on,
sometimes even if it is worse. It tries 25,000 moves, five times over, so one
click scores about 125,000 lineups.

A profile said 80% of the time was in the scoring function, and most of that
was not arithmetic. Each call built fresh arrays: one "who is on the field"
row per period and one position-count row per player. For a 7v7 game with
eleven kids that is about twenty small arrays, 125,000 times, and the garbage
collector clearing up after them.

The fix keeps one set of flat typed arrays next to the problem and refills
them on each call. The sums are done in the same order as before, which
matters: the annealer compares scores to decide which move to keep, and a
change in the last bit of a floating-point total could, in principle, send it
down a different path. So the check is strict. The old scoring function now
lives in the test file and must give exactly the same number on 2,400 random
lineups, and 24 full lineups across all eight sport presets hash the same
before and after.

The numbers, on a 4-core container:

| | before | after |
|---|---:|---:|
| one lineup for the example roster | 179 ms | 82 ms |
| the tool's main test file | 5.6 s | 2.1 s |

The faster win, a score that only recomputes the period a move touched, was
left alone on purpose: it adds the same numbers in a different order, and the
lineups coaches already printed should not shift because we made the tool
quicker. The write-up with the profile and the ranked next steps is in
[`docs/history/ci-perf-2026-11-18-lineup-cost-scratch.md`](../history/ci-perf-2026-11-18-lineup-cost-scratch.md).
