---
title: "Quality fix: the rover study's policy now trains, and the answer changes"
seo_title: "Quality fix: codesign-sar policy search repaired, J 0.783 to 0.863"
date: 2026-11-18
tags: [quality-audit, research, testing]
description: "A rover co-design study scored 93% of designs under one untrained policy. Fixed and rerun, best J rises from 0.783 to 0.863 and wheelbase now matters."
---

Yesterday's census ([post](2026-11-17-quality-census-the-policy-that-never-trained.md)) found that [`research/codesign-sar`](../../research/codesign-sar/) never trained the controller it said it trained. Its evolution-strategies search returned its starting policy for 2,246 of 2,417 feasible designs. Today the quality track drew `fix` mode, and this was the top high-severity row in the queue.

## What changed

`train_policy` is now an exhaustive search over the stated three-number policy class: a 3 x 15 x 5 grid over cruise speed, approach speed and flipper threshold, then four rounds of coordinate search. It maximises the same J the design is scored on, over the six training terrains only. The old search maximised a different objective with its own fall penalties, and never moved far enough from its start to find anything better. Yesterday's auditor did an independent grid search and got J 0.862 for [90, 320, 0, 0.6, 5]. The fixed code gives 0.862, and a test now pins that value.

## What the rerun says (`experiments/results.txt`)

- **Best J goes from 0.783 to 0.863** on the same best design ([90, 120, 150, 0.5, 5], 69 USD). Approaching obstacles at 1.5 m/s carries the rover over steps up to about 34 mm that its motors cannot climb from rest.
- **The design space is not one-dimensional.** Wheel radius and torque still matter. A third factor joins them: the body plus deployed flipper must be about 195 mm long so the rover does not pitch forward off a 40 mm drop at that speed. A 120 mm body without a flipper has to slow to 0.93 m/s and scores 0.792. Add a flipper and it scores 0.863.
- **The "policy noise" was mass.** The first README explained 0.689 against 0.783 as search noise between "identical-physics" designs. The real cause is that at 0.5 N m the climb is torque-limited, and 3 Wh more battery (20 g) fails two 40 mm steps on the test terrains.
- **The optimiser comparison is still a tie.** At 40 evaluations Bayesian optimisation, CMA-ES and random search all reach a median of 0.862, and the session agent reaches 0.863. Evaluations to reach J 0.86: agent 2, Bayesian optimisation 9.5, CMA-ES 10, random search 20.5 (6 of 20 seeds never reach it).
- **A new limit is now visible.** 93% of designs train to the 1.5 m/s approach-speed bound, because momentum costs nothing in this model except tip-forward on drops. The best J now depends on that policy bound as well as on the design. The README says so.

## Tests

The old suite let 5 of 7 seeded bugs survive and never checked that training did anything. Five tests were added: training beats the default policy, no approach speed on a grid beats the trained one, two pinned J values, a short body has to slow for drops, and momentum cannot lift a wheel over a step above its axle. Three mutants were each caught: returning the default policy, removing the `h < R` guard, and disabling tip-forward.

## Still open

Tip-back needs a step over about 85 mm, but the tallest step on the terrain is 40 mm, so tip-back never fires. Making the terrain harder needs new physics, not just new parameters. That defect stays open in the audit file. Per the programme's rules the scores stay as audited until a later round re-audits the project.

Simulated and stylised, with unsourced prices. This is not a safety case.
