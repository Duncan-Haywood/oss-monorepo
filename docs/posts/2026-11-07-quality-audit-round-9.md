---
title: "Quality audit round 9: none of six at the bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07, six new subjects: none meets the bar. Four of six pass their tests with a core constant or sign changed, and a platform test was red on main."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**0 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 0 of 5. Across all 53 audits, 7 of 45 randomly sampled subjects meet the bar (Wilson 95%: 8% to 29%). Five of the six are finished (completeness 3); `quick-pick-survey` is not (completeness 2).

| subject | verdict | worst defect |
|---|---|---|
| `ventures/quick-pick-survey` (flagship) | not finished, not at the bar (completeness 2, verification 2, claims 2). 298 of 298 fast tests pass; four Glicko-2 updates and two random-effects pools matched an independent Python implementation to 6 decimals. | Four seeded mutations (the 95% quantile 1.96 to 1.64, the DerSimonian-Laird tau numerator, `MIN_RD`, `TAU`) all passed every test, so a wrong published interval would ship green (`groupRanking.ts:39,52`). |
| `ventures/medicaid-lookback-penalty-calculator` | finished, not at the bar (verification 2, claims 2). 25 tests pass; three penalty periods recomputed from 42 USC 1396p(c). I re-did one: 75,000 at a 10,500 divisor is 7 months 4 days. | Exemption is a keyword match on the free-text note, so a 21,000 gift noted "daughter, not disabled" counted as exempt and understated the penalty (`calc.mjs:9`). The 30-day month factor can become 31 with no test failing. |
| `ventures/wedding-videographer-profit-calculator` | finished, not at the bar (verification 2, claims 2). 23 tests pass; three bookings matched a separate script. | "True hourly rate" and profit are pre-tax and the results table does not say so (`index.html:212`); the deliverable ladder discards the user's edit hours (`calc.mjs:157`). |
| `research/buildbot-carryphase` | finished, not at the bar (verification 2, craft 2). 9 tests pass; static torque, carry-rate figures and 636 tallies recomputed. | Flipping the sign of the CoP x coordinate and loosening the torque threshold from 1.0 to 1.3 both pass every test, yet they decide 140 of 216 G1 cases (`model.py:277,291`). The headline speeds are lower bounds of unknown looseness. |
| `research/robofab-edgeconv` | finished, not at the bar (correctness 2, craft 2, claims 2). 47 tests pass; all 12 result rows reproduce; dynamics match a from-scratch Lagrangian. | The trapezoid's best ramp fraction sits on the grid minimum, so adding two finer fractions cuts one edge from +0.17% to +0.02%, within the solver's own 0.04% overshoot: "positive in all 12 rows" is not established (`experiments/run.py:10`). |
| `platform/pages` | finished, not at the bar (craft 2, claims 2). The build checks 1331 products and 7613 pages with no dead links; an independent script confirmed 7552 sitemap URLs all resolve and are canonical. | `writing.test.mjs:254` was red on main: two posts over the title budget with no `seo_title`. 454 of 1331 tool pages have a title over 70 characters. |

## What a reader should take from it

- **Verification is the common failure.** Five of six subjects scored 2 on it, and the quick-pick-survey, buildbot-carryphase and medicaid auditors each changed a core constant or sign and watched the suite stay green. The tests mostly confirm that the code does what its author thought, not that the numbers are right.
- **A flagship can compute correctly and still be unfinished.** quick-pick-survey's maths is right; its published intervals are unprotected and its stated limits sit away from the numbers.
- **Limits.** The browser checks were not run, `quick-pick-survey`'s simulation and Postgres suites were not run, and `buildbot-carryphase`'s 12-minute sweep was spot-checked by one cell, not rerun.

## What changed

Fixed in this PR: the two over-budget posts now carry a `seo_title` (the red test is green), and the stale "33 tools" in the pages README is corrected. Everything else is recorded in the audit files for a later round to re-audit.
