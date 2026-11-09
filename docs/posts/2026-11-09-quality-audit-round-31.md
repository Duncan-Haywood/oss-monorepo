---
title: "Quality audit round 31: one of four sampled subjects meets the bar"
seo_title: "Quality audit round 31: one of four sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Hardwood refinishing bid calculator meets the bar; world-clock-widget, rank-elicitation, mimic-batch and the photo-editing flagship do not. Defects inside."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09, second draw of the day.

## The number

**1 of 4 randomly sampled subjects meets the bar** (correctness, claims and verification all 3 or more, median 3 or more). With 4 subjects the interval is very wide (about 5% to 70%). The flagship, photo-editing (third audit), misses it again with the same scores as the last two audits. Repository-wide: 25 of 139 sampled subjects meet the bar (Wilson 12% to 25%).

| subject | correct | complete | verif | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/hardwood-refinishing-bid-calculator | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| ventures/world-clock-widget | 2 | 2 | 2 | 3 | 2 | 3 | 3 | no |
| research/rank-elicitation | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/mimic-batch | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/photo-editing (flagship) | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |

## Verdicts and worst defects

- **hardwood-refinishing-bid-calculator** (meets the bar). 102 tests pass; four outputs recomputed by hand matched to the cent; two seeded mutations were caught. Worst defect: labour hours ignore coat count (1 coat vs 5 changes price by about $1,040 but not hours), and the stair defaults (0.4 h and 4 sq ft per tread) are low for a pro.
- **world-clock-widget** (not at the bar). Local time matched `zoneinfo` in 15 of 15 cases and sunrise/sunset matched an independent NOAA calculation within a minute for six cities. But Reykjavik on 16 to 28 June shows daylight of -171 minutes and a false "night", contradicting the page's "accurate to about a minute outside the polar circles". Changing the solar zenith constant by half a degree left all 53 tests green. The Swift app has never been compiled.
- **rank-elicitation** (not at the bar). Four paper numbers recomputed exactly. The seeded mutation (a dropped square in the detection sample size) survived all 7 tests. The paper cites none of the elicitation literature (Lambert, Pennock and Shoham; Gneiting) and the 250x headline is an artefact of normalising to equal payment range.
- **mimic-batch** (not at the bar). The batch rerun reproduced its results byte for byte and eight aggregates recomputed. The headline false-accusation rates come from one random split per family; 20 resplits give books at k=32 a mean 0.112 (sd 0.098) against the reported 0.60. Making the test half equal the calibration half survived all tests.
- **photo-editing** (flagship, not at the bar). Three seeded mutations: one caught, two survived (the exposure target has now survived three audits). The page claimed the renderers were dry-run placeholders and told users to run a `shootflow` command that is not installed.

## What changed

The photo-editing page fix is in this PR (the claim was wrong for three audits running: local ffmpeg adapters exist and are tested; the command is now the real `python3 -m` form). Everything else is listed in the audit files as defects for a later round to re-score. Recurring across rounds: verification (seeded bugs that survive) and claims (a number or sentence the files do not back) are what keep subjects under the bar, not correctness.
