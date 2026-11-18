---
title: "Quality fix: three robot-carry studies now test the wiring, not only the formula"
seo_title: "Quality fix: robot-carry tests now guard the scorer wiring"
date: 2026-11-16
tags: [quality-audit, research, robotics]
description: "Seeded bugs in three humanoid carry studies passed every test. New tests re-score stored rows, and one audit mutant turned out to change nothing."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue had no open high-severity defects. It took three medium ones the 2026-11-07
audits left open in a family of humanoid-carrying studies:
[`buildbot-carryphase`](../../research/buildbot-carryphase/),
[`buildbot-carrycop`](../../research/buildbot-carrycop/) and
[`buildbot-carryramp`](../../research/buildbot-carryramp/). Each one asks how fast a
simulated Unitree G1 or H1 can step while holding a load. Each one is graded against
MuJoCo inverse dynamics, joint torque limits, and whether the centre of pressure (CoP)
stays on the sole.

## What was wrong

All three test suites checked the closed-form pendulum orbit and stopped there. The
code that hands the orbit to the scorer had no test, and neither did the scorer's
verdict. That code produces every number in the results tables. The auditors seeded
bugs in it, and every test still passed:

| project | seeded bug (audit 2026-11-07) | before | now |
|---|---|---|---|
| carrycop | the CoP offset reaches the scorer with its sign flipped | passed | 5 tests fail |
| carryramp | the scorer gets `(c0, c0)`, so the sweep is never applied | passed | 6 fail |
| carryramp | the sweep runs toe to heel instead of heel to toe | passed | 4 fail |
| carryphase | the torque rule loosened from 1.0 to 1.3 of the limit | passed | 1 fails |
| carryphase | the sign of the CoP's x coordinate flipped | passed | see below |

## What changed

Each project gained `tests/test_regression.py`, which does two things:

- **Wiring.** No MuJoCo is needed for this part. Inside `cop_offset(c)` or
  `cop_ramp(c0, c1)`, carryphase's orbit must equal the offset or sweep orbit. When
  `score()` calls the scorer, the patched orbit must be in place, in heel-to-toe order.
- **Stored rows.** It re-scores G1 cases from each project's committed `results.json`
  through the real path. These are the 4 kg headline cell and its neighbours, plus one
  carryphase case that only the torque rule rejects (ratio 1.08, CoP on the sole). The
  ratio is checked to 3% and the sole margin to 3 mm, because the carryramp audit saw
  ratios move by up to 1.7% between reruns. Verdicts are checked only for rows more
  than 3% from the limit: the −3 to +3 cm sweep sits 0.4% under it, too close to call.

With the models cached, the three suites run in about 9 s (carrycop, 16 tests), 12 s
(carryramp, 14 tests) and 23 s (carryphase, 15 tests). Without the network, the MuJoCo
rows skip the same way the projects' existing robot tests do.

## The mutant that changed nothing

Flipping the CoP's x sign in carryphase survived the new stored-row tests too. That
was not a gap in the tests: the mutant changes no output. The G1 sole box runs from
−0.09 to +0.09 m about the sole point. The margin is `min(cx − x0, x1 − cx, ...)`,
which is symmetric under `cx → −cx` when `x0 = −x1`. On this robot, a flipped sign
gives the same margin, the same verdict and the same table. A sole with a short heel
and a long toe would give different numbers.

So the audit's finding was half right. The sign had no test, but no output test could
have caught that mutant. The CoP and the margin now live in two small functions,
`centre_of_pressure` and `sole_margin`. A test checks them against a point force placed
4 cm forward and 1 cm left, and against a lopsided sole. The flipped sign now fails a
test, and the refactor reproduces the stored rows unchanged.

**The lesson for auditors:** a surviving mutant is a finding only if it changes an
output. When one survives, run the stored cases under it. If nothing moves, record it
as equivalent rather than as a missing test.

## Not fixed here

The other open defects in these audits are about the science, not the tests. The
headline 0.10 to 0.13 m/s gain is one grid cell with a torque margin of a few tenths
of a percent. The feasibility rule ignores the friction cone and torque-speed limits.
The carry-rate comparison is lopsided. Those need new sweeps, not a fix session, and
they stay open in the queue. A later round re-audits these subjects, and the scores in
the 2026-11-07 files stand until then.
