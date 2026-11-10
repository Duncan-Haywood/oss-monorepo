---
title: "Quality audit round 39: one of four sampled subjects meets the bar"
seo_title: "Quality audit round 39: one of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "One of four sampled subjects meets the senior-professional bar: a gig-driver earnings analyzer. A trampoline-park model and two research twins miss on tests or claims."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Mode `sample`, seed 2026-11-10 (no flagship or platform subject was drawn: all were audited recently).

## The number

**1 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 170 meet it (Wilson 95% interval 12% to 23%). Four subjects is too few to say anything about this round alone.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/gig-driver-earnings-report-analyzer | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |
| ventures/trampoline-park-profit-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/lag-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/ransac-twin | 4 | 3 | 2 | 3 | 2 | 1 | 2 | no |

## Verdicts and worst defects

**gig-driver-earnings-report-analyzer (meets the bar).** 33 of 33 tests pass; a two-trip file recomputed by hand (net 6.60, 7.92 per hour, 0.44 per mile) matches the tool, and I re-ran it. 3 of 4 seeded mutations caught; the survivor is `MIN_TRIPS` at `calc.mjs:232`. Worst defect: the page reads any semicolon-delimited file as decimal-comma (`index.html:151`), so `12.50;3.2` becomes pay 1250 and miles 32 with no warning. A separate Time column is also ignored.

**trampoline-park-profit-calculator (fails on verification and claims).** 24 tests pass and the sample P&L reproduces to the cent in an independent script (profit 9,311.92, payback 64.43 months). But 3 of 5 seeded mutations survived, including the loan term in the 10%/20%-fewer-visits payback shown on the page. The $250k to $800k build cost and "lenders want under five years" have no source, and the model has no manager payroll or DSCR.

**lag-twin (fails on verification and claims).** All headline numbers reproduce with an independent root finder. Worst defect: the whitepaper said equality in the 1/(3τ) speed cap holds "iff a triple pole". A one-liner with `numpy.roots` shows ζ=1.5 and ζ=2 also reach 0.3333, so that was false. **Fixed in this PR with a test and a corrected sentence**; the audit scores are before the fix. Two of four non-equivalent mutations survive, and the result is a textbook Routh-condition example.

**ransac-twin (fails on verification and claims).** The exact-arithmetic recomputation matches (failure 0.140776 at K=17, 99% budget 458 for κ=4). But `ransac_line`, which produces the end-to-end headline rates, has no test: two seeded bugs there left all 6 tests green. The only citation is Fischler and Bolles; adaptive termination work is absent, and "K sized on the mean inlier fraction under-covers" is Jensen's inequality, so the result is not new as framed.

## What is not at the bar

Three of four miss, all with verification at 2: tests passed while seeded changes to core logic also passed. The pattern holds across the corpus (verification at 3 or more in 82 of 184 audits). Open defects not fixed here are listed in each audit file.
