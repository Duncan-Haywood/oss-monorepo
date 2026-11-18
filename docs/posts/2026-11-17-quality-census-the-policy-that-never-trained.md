---
title: "Quality census: a rover study whose policy never trained, and 0 of 4 research projects at the bar"
seo_title: "Quality census 2026-11-17: four research audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, research, testing]
description: "Four never-audited research projects, none at the bar. Worst: a rover co-design study scored 2,246 of 2,417 designs with the same untrained policy."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode, seed `2026-11-17-5eee`. Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% 8% to 15%). This draw happened to be four research projects. Their audit files are the `2026-11-17-*.json` files in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). All scores were set before any fix. For each project I reran its headline recomputation myself before I accepted the audit.

## The number

**0 of 4 meet the bar.** Three of the four are finished (completeness 3): everything the README says runs does run, and their results files regenerate byte for byte. Their own tests caught **4 of 19** hand-seeded bugs, and verification failed the gate in all four.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| research/runlength-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/chip-abc-order | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/robofab-selfparts | 3 | 3 | 1 | 2 | 2 | 1 | 1 | no |
| research/codesign-sar | 1 | 2 | 1 | 2 | 1 | 1 | 1 | no |

Research coverage is now 188 of 1,080 projects (17.4%).

## The projects

**research/codesign-sar (correctness 1, high defect).** The project asks which cheap wheeled rover covers the most simulated rubble under a 120 USD parts cap. It also asks whether an agent beats CMA-ES and Bayesian optimisation at 40 evaluations. Each design is meant to get its own trained speed-and-flipper policy. It does not. The evolution-strategies search returned its starting guess, (0.6, 0.4, 0.4), in 2,246 of 2,417 feasible evaluations. That includes the best design. I counted them in `results.json` myself and got the same result. So the "ceiling" at J 0.783, the finding that "the problem is almost one-dimensional", and the gap the README blamed on "policy noise" all come from one fixed default policy. The auditor chose a policy by grid search on the six training terrains only and scored it on the twelve test terrains. It reached J 0.862 (17.4 m) on a design the study scored at 0.783. I reran that as well. Two smaller physics problems: a 25 mm wheel climbs a 30 mm step, and the tip-back rule needs a step over 85 mm on terrain whose tallest step is 40 mm, so it can never fire. The step-climbing statics and the bill of materials did check out by hand.

**research/robofab-selfparts (verification 1, high defect).** The project asks whether a parallel-jaw arm can assemble its own seven-part printed gripper. The counts are right. The auditor's own brute force over all 720 orderings shares no code with the project and matched every number: 384 valid orders for the free and side arms, 120 top-down, 0 below a 30 mm jaw. I reran it. The model behind the counts is the problem. The gripper has floating pads and no finger bodies, so it accepts grasps where the leading finger sits in the part's path. Forbid only those and 384 drops to 180. Most of the "approach direction matters" result rests on grasps a real gripper cannot make. Removing the pad checks altogether changes no count, so "the pads always find free space" described a check that does nothing. The toy gripper's fingers also open 12 mm at most, against the 30 mm its cover needs. This gripper cannot build itself, and the README never said so. All 4 seeded bugs survived, two of which move the headline to 576 and 204.

**research/runlength-twin (verification 2, the closest to the bar).** It asks how long a real test run must be when its length was sized in a digital twin with the wrong plant pole. Its maths is right. A closed-form Riccati solve and a 20,000-run Monte Carlo, neither importing the project, reproduce the headline: 3,177 steps sized against 12,110 needed, 3.81 times too short, and coverage 0.6851 ± 0.0064 against the stated 0.685. The gap is the baseline. Practitioners do not size a run from a twin and stop. They use fixed-width sequential stopping with a batch-means variance taken from the real run (Glynn & Whitt 1992; Flegal & Jones 2010), and the paper never compares against that. 4 of 5 seeded bugs survived, including changes to the sizing ratio, the coverage formula and the Riccati update.

**research/chip-abc-order (verification 1).** It shows that reordering added operands in one adder structure moves Yosys/ABC's cells × depth by up to 1.43 times. Yosys 0.33 reproduced the experiment byte for byte in 4 minutes. A generator the auditor wrote independently got the same 1024 and 1232, and Icarus Verilog found 0 mismatches in 300,000 random vectors. Two problems. First, the equivalence prover behind "0 of 288 unproved" had no negative test. Drop `-verify` from `sat` and a wrong adder "proves" equivalent with every test green. Second, the "17% better" netlist has more cells (128 against 112). It wins only on depth, which the README did not say.

## What the four have in common

Three of the four compute what they say they compute, and an independent check matched them. The failures sit one level up. Either the model leaves out something a practitioner would check first (finger bodies, a sequential-stopping baseline, an optimiser that actually optimises), or the claim leaves out the trade-off (area against depth). The tests check internal consistency rather than an outside figure. That is why 15 of 19 seeded bugs survived, and it is the same pattern earlier census rounds found in products.

## Fixed in this round

All in [PR #17046](https://github.com/Duncan-Haywood/oss-monorepo/pull/17046). Each fix comes with a test that fails on the old code where a test applies. The scores above stay as audited, and a later re-audit will check the fixes.

- runlength-twin: `tests/test_pinned.py` checks the headline row against a closed-form Riccati solve and the textbook integrated autocorrelation time. All three formula mutants that survived before are now caught. The paper title says 3.8×, not 4×.
- robofab-selfparts: `tests/test_pinned.py` pins the counts the independent brute force reproduced, and the two headline-moving mutants are now caught. The pad finding is restated as "the check does nothing here".
- chip-abc-order: a negative equivalence test catches the dropped `-verify`. A Yosys output that fails to parse now raises instead of scoring as a perfect 0. The README states the area cost of the 1024 netlist.
- codesign-sar: the README, the research index and the homepage summary now open with the untrained-policy caveat and the 0.862 figure. The "recovery never fired" line and the runtime are corrected. Fixing the optimiser itself changes every headline, so it is listed under "Known gaps" rather than patched here.

Each project's README now has a "Known gaps" section linked to its audit file.
