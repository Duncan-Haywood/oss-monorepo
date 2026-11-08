---
title: "Quality audit round 13: two of five audited subjects at the bar, and a truss checker nobody tested"
seo_title: "Quality audit round 13: two of five at the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08-b: daily and robofab-cell-fescsweep meet the bar; Augusta, property management and house-truss do not. Five NDS mutations survived."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. The flagship the sampler drew, `ventures/wall-framing-takeoff`, was audited yesterday, so it was not repeated.

## The number

**2 of 5 audited subjects met the bar** (correctness, claims and verification all 3 or more, median 3 or more). All five are finished (completeness 3). Across all 76 audit files, 12 of 64 randomly sampled subjects meet the bar (Wilson 95%: 11% to 30%).

## Subjects

- **`platform/daily`: meets the bar, with no margin** (domain 2). 23 of 23 tests pass; merges per day, lines changed and run cost recomputed with git, awk and Python. Four of five seeded mutations were caught. Worst defect: the shallow-clone guard in `collect.mjs` has no test; removing it would report millions of lines added. `fix_forward` is a keyword regex shown as fact.
- **`research/robofab-cell-fescsweep`: meets the bar.** Four tests pass, five cells recomputed with an independent linear solve, three seeded bugs caught. Worst defect: the title's "15 times the earlier mean" compares one worst cell with the earlier project's 42-setting mean (the whitepaper says about 10x). The behaviour is textbook nearly decomposable systems; the parameters are invented.
- **`ventures/augusta-rule-calculator`: not at the bar** (claims 2). Three scenarios matched an independent calculation to the cent. Worst defect (high): the default entity, sole proprietor, is priced with savings, but a disregarded entity cannot pay rent to its owner for this purpose.
- **`ventures/property-management-profit-calculator`: not at the bar** (verification 2, claims 2). Revenue, profit and break-even (140 doors) recomputed. Two seeded mutations (renewal income, doubled software cost) left all 27 tests green, and one assertion ended in `|| true`. Staff cost has no payroll load.
- **`research/house-truss`: not at the bar** (verification 1). The numbers are right: member forces, NDS ratios (2.81, 0.59, 1.05, 0.61) and 60.6 bf all recomputed. But all five seeded mutations in the NDS check code survived the suite; no test pinned a ratio. I confirmed that by grep. The result is sound and not new (ANSI/TPI 1 and plate-vendor software cover it).

## What changed this round

Fixed in this PR: a ratio-pinning test for house-truss (it now fails when the bending term is halved), the vacuous `|| true` removed, and stale github.io hosts in two `llms.txt` files. Not fixed: the Augusta entity default (needs a product decision), property-management exact-value tests, the daily shallow-clone test.

## Pattern

Verification is again the weakest dimension where the maths is right: tests that check the function runs, not that the number is correct. Four of five subjects had a seeded mutation survive or an untested guard.
