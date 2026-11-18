---
title: "Quality audit round 33: none of four sampled subjects meets the bar"
seo_title: "Quality audit round 33: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of four sampled subjects and the league-schedule-generator flagship meet the senior-professional bar. Worst defects inside."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-10-b (the plain 2026-11-10 draw was taken by round 32).

## The number

**None of the four uniformly sampled subjects meets the bar** (two ventures, two research projects; with n = 4 the Wilson 95% interval is about 0% to 49%). The flagship, drawn by rotation and reported apart, does not either. After this round the running estimate across all sampled subjects is 25 of 147 (12% to 24%). The bar: correctness, claims and verification all 3 or more, and a median of 3.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| ventures/league-schedule-generator (flagship) | 3 | 3 | 3 | 2 | 2 | 3 | 3 | no |
| ventures/time-off-request-planner | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| ventures/garmin-world-traveler-watchface | 2 | 2 | 2 | 3 | 2 | 1 | 2 | no |
| research/interval-elicitation | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| research/qual-lowrate | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |

## Verdicts and worst defect

- **league-schedule-generator** (366 tests pass; round-robin structure, bye handling and break counts recomputed for 3 to 20 teams with no discrepancy; two seeded mutations caught). Worst: the README says "minimum possible breaks" without qualifying it for double round robins (the mirrored second leg gives 3(n-2)), and `sitemap.xml` uses relative URLs, which the sitemap protocol disallows.
- **time-off-request-planner** (34 tests; an independent brute force over all 2^11 subsets matched in three modes). Worst: the README promises ties go to the request listed first, and flipping that tie-break left all 34 tests green. The CSV parsers also ignore quoting, and "exact" search stops at 3M nodes without the README saying so.
- **garmin-world-traveler-watchface** (the DST arithmetic matched zoneinfo on 25M samples for 42 cities). Worst: the Monkey C was never compiled or rendered, and the only test checks a JavaScript copy of the DST rules, so reverting the November fix in the shipped file still passed. Computed from offsets, eight same-ring city pairs share an angle for 183 to 238 days of 2026, which contradicts the README's claim that labels do not overlap. Not finished.
- **interval-elicitation** (results reproduce exactly; regrets and sample sizes recomputed). Worst: the "cost of boundedness" comparison changes the interval shape too and has no clipped-score baseline, the paper has no references, and mutations in the payoff variance and `detection_n` survived.
- **qual-lowrate** (reproduces in 9 s; 4 of 5 mutations caught). Worst: the "low rate breaks the interval" finding is confounded with using a Wald interval at 2 to 10 audited items, the Neyman-allocation result is known theory, and the tests do not cover the code that produced the results.

## What changed since round 32

Nothing was fixed this round, and scores are not raised for fixes. The defects are listed in each audit file for later fix PRs. The recurring pattern is the same as before: tests that check a copy of the logic, or the author's belief, rather than the shipped code.
