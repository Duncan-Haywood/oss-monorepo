---
title: "Quality audit round 29: none of four sampled subjects meets the bar"
seo_title: "Quality audit round 29: none of four sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Two ventures and two research projects plus the shift-roster-builder flagship: none meets the bar. Verification and claims are the recurring gaps."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09 (drawn after the earlier rounds today; the platform stratum had no unaudited directory).

## The number

**0 of 4 randomly sampled subjects meet the bar** (correctness, claims and verification all 3 or more, median 3 or more). The flagship, shift-roster-builder (third audit), also misses it. All five are finished (completeness 3) except `mimic-anycontext-size` (2). With 4 subjects the interval is very wide (0% to 49%); the repository-wide figure is in the scoreboard below.

## Subjects

| subject | correct | complete | verif | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/workers-comp-premium-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/hard-money-loan-cost-calculator | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| research/rain-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/mimic-anycontext-size | 3 | 2 | 1 | 2 | 3 | 2 | 2 | no |
| ventures/shift-roster-builder (flagship) | 3 | 3 | 3 | 2 | 2 | 3 | 3 | no |

- **workers-comp-premium-calculator.** Arithmetic matched an independent NCCI-order recomputation to the cent, but 4 of 5 seeded mutations survived, including taking the premium discount before the schedule modification. The discount is one typed percentage, not the NCCI size-band table, so totals will not tie to a real quote. The README's test command fails.
- **hard-money-loan-cost-calculator.** Best of the round: every recomputed number matched and all 5 seeded mutations were caught. Worst defect: the "effective annual rate" is cost over average balance (16.0% on a simple loan where IRR is 16.19% nominal), and the page does not say it differs from a lender's APR.
- **rain-twin.** Numbers reproduce and match an independent bisection-based recompute. Halving the `var_atten` squared-mean term was not caught by any test, no test pins the headline Brier and range numbers, and the README does not place the result against ITU-R P.530/P.837 rain-fade work. The simulated truth comes from the ensemble's own model.
- **mimic-anycontext-size.** Every reported number recomputes from the cached scores, but no test calls `analyse()`, so two seeded bugs in the reported statistics passed all 4 tests. The size effect has no uncertainty, and a below-chance detector is not explained.
- **shift-roster-builder.** 239 tests pass and the arithmetic matches. Still unfixed from earlier rounds: the weekly overtime threshold is guarded by one test out of 147 in `calc.test.mjs` and none in the CLI tests; a shifts file whose first line is `Mon 8am-5pm` is silently dropped as a header. New: overnight shifts count on the day they start, which misprices daily-overtime states, and the README does not say so. `llms.txt` was fixed since round 2.

## What changed since the last round

Nothing in these subjects was fixed in this round (scores are pre-fix). Recommended small fixes are listed in each audit file. Two defects recur across ventures: relative canonical, sitemap and robots URLs, and tests that check what the author believed rather than pinning computed results.

## Not at the bar

Verification (tests that would catch a seeded bug) and claims remain the dimensions that sink subjects, as in earlier rounds.
