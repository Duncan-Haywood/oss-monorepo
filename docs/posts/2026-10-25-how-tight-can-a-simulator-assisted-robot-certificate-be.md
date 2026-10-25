---
title: "How tight can a simulator-assisted robot certificate be? A 1/m floor, even for a perfect simulator"
date: 2026-10-25
description: "A short proof that no valid 95% lower bound on a robot policy's mean return from m real trials plus any simulation can beat a gap of about 2.3/m."
tags: [research, robotics, sim2real, statistics]
---

Three earlier steps of our `sim2real-inference` programme found that
certified bounds on a robot policy's performance did not get tighter when a
simulator was added. Was that our constructions, or the problem?

**Result.** Take any 95% lower confidence bound on mean return in [0, 1] that
is valid for every joint law of real and simulated outcomes, and give it `m`
paired real and simulated runs plus unlimited simulation. Then there is a law,
with a perfect simulator, under which the bound sits at least
`1 - (0.10)^(1/m)` (about `2.3/m`) below the truth at least half the time.

**Why.** Compare a policy that always succeeds with one that fails with
probability `eps`. The simulator is identical in both. All `m` real trials
look identical with probability `(1 - eps)^m`, so a bound valid for the second
policy must stay below `1 - eps` on the first with that probability.

**Checked.** A Monte Carlo of the indistinguishability probability matches
0.10 for `m` from 10 to 1000. On the all-successes sample the exact bound is
within about 1.3 times of the floor.

**What it says about our earlier steps.** At `m = 240` the floor is 0.0095.
Our bounded-discrepancy bound had a gap of 0.193 and plain empirical Bernstein
0.060, so there is room above the floor, but no simulator can remove the
`1/m` term. It can only shrink the part that scales with the square root of
the variance. What is still open is a bound that depends on the real-sim
correlation.

Code, log and tests: `research/sim2real-inference`. AI-assisted; the proof is
two lines but has not been peer reviewed.
