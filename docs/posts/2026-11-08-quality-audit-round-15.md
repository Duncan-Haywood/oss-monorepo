---
title: "Quality audit round 15: one of five sampled subjects meets the bar, and a meal app category is wrong"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08-d: the Schedule C categorizer meets the bar. The flagship bookkeeper does not, for stale claims. A UBER EATS charge is deducted at 100% instead of 50%."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**1 of 5 randomly sampled subjects met the bar** (correctness, claims and verification all 3 or more, median 3 or more); the re-audited flagship, `ventures/ai-bookkeeper`, did not. All six are finished (completeness 3) except where noted. Across all 86 audited subjects, 13 of 74 randomly sampled ones meet the bar (Wilson 95%: 11% to 28%).

## Subjects

- **`ventures/freelancer-schedule-c-categorizer`: meets the bar.** 35 of 35 tests pass. The sample CSV recomputed by hand (income 8,620.10, expenses 1,129.51, net 7,490.59). The 50% meals limit and the line numbers were checked from memory of the 2024 Schedule C and Pub 535, not fetched. Worst defect, which I confirmed by reading `calc.mjs`: the travel rule (`uber\b`) is listed before the meals rule, so "UBER EATS" is deducted 100% on line 24a, not 50% on line 24b, with no flag. "mobil" also matches "mobile".
- **`ventures/ai-bookkeeper` (flagship): not at the bar** (claims 2). 2,398 of 2,398 tests pass. A six-line statement recomputed by hand (trial balance 2,750.00). The README learning-curve table is stale: it says month 1 is 100% right, and the benchmark now prints 94.3%. `llms.txt` still links the retired github.io host. A seeded change to the 5-day transfer boundary was not caught by any test (the same gap as last round). No change since the 2026-11-07 audit.
- **`ventures/solar-panel-cleaning-quote-planner`: not at the bar** (claims 2). 24 of 24 tests pass, three hand recomputations matched, three of three mutations caught. Its `llms.txt`, sitemap and canonical link use the retired host or relative URLs, which crawlers ignore. A margin above 90% is silently clamped.
- **`research/accel-cascade`: not at the bar** (verification 2). The README table recomputed from `results.json` matches. A seeded `<` to `<=` in the cascade threshold passed all 6 tests. The headline "0 to 28%" saving is a seed mean; one seed reaches 37%.
- **`research/free-robustpaired`: not at the bar** (verification 2, craft 2). Changing the median of squared residuals to absolute residuals passed all 6 tests. The finding itself is textbook, and the null needs the true system, which a practitioner does not have.
- **`platform/uitest`: not at the bar** (claims 2, domain 2). The keyless smoke check passes pages showing "NaN" or "Error: failed to save" with exit 0. The README implies it catches these. Three of four mutations were caught; removing the blank-page check was not.

## What changed since round 14

Nothing is fixed in this round. Open defects are listed in the audit files. The pattern repeats from earlier rounds: the numbers are mostly right, while discovery files point at a retired host and tests miss boundary mutations.
