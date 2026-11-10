---
title: "Quality audit round 34: none of four sampled subjects meets the bar, and verification binds every time"
seo_title: "Quality audit round 34: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "Zero of four sampled subjects meet the senior-professional bar. All four are finished and mostly correct, but their tests miss seeded bugs."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-10 (mode `sample`).

## The number

**None of the four uniformly sampled subjects meets the bar** (two ventures, two research projects; with n = 4 the Wilson 95% interval is about 0% to 49%). The bar: correctness, claims and verification all 3 or more, and a median of 3. All four are *finished* (completeness 3) and all four have correctness 3. What fails them is verification, 2 in every case: the numbers are right, but the tests would not notice if they went wrong.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| ventures/gbp-bulk-location-check | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| ventures/tip-fica-credit-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| research/interval-scores | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/qual-negaudit | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |

## Per subject

- **gbp-bulk-location-check.** 37 tests pass, but 5 of 10 seeded mutations survived (E.164 max digits, the NJ, NH and MA ZIP ranges, the hours closing limit). Country list matches tzdata's ISO 3166 file. Worst defect: the ZIP and phone tables are barely tested; Guam (longitude +144.75) gets a false "positive longitude for a US location" warning (`calc.mjs:566`). Domain is 2 because the Google template rules are admitted to be from memory.
- **tip-fica-credit-calculator.** Six hand recomputations from the section 45B rule match to the cent (for example $2.13/h, 1,500 h, $24,000 tips gives (24,000 − 4,530) × 7.65% = $1,489.455; I re-did this one myself). 20 tests pass, but 4 of 7 mutations survived, including removing the wage-base room term (`calc.mjs:64`). Worst defect: a thousands comma in a roster line (`Maria, 2.13, 1500, 24,000`) reads tips as $24 with no warning (`calc.mjs:46`); blank fields silently take example values (`index.html:81`).
- **interval-scores.** Headline numbers reproduced with scipy and numpy, not the project's code; `run.py` regenerates `results.txt` exactly. 2 of 6 mutations survived, both in `detection_n` and `coverage_n`. Worst defect: whitepaper section 5 compares sample sizes at unequal power (50% for detection, about 95% for coverage), which undercuts "the score detects faster than coverage". The Winkler regret and finite Cauchy results already sit in `research/interval-elicitation`, so novelty is overstated.
- **qual-negaudit.** An independent loader, estimator and Monte Carlo reproduce truth 0.2522 and the coverage, bias, RMSE and width curves within MC error. 4 of 7 mutations survived; no test checks an interval or coverage. Worst defect: the design duplicates `qual-lowrate`, uncited, and the "need about 50" result follows from the binomial variance and is largely a Wald-interval artefact. One README claim is false: k=2 intervals have 0.019 width, not zero.

## What is not at the bar

Everything above. The live pages at marisstella.app could not be loaded through this session's proxy (HTTP 000), so no audit here checked the served page; claims were checked against files only. The audits record medium-severity defects only; none of them were fixed in this round.

## Pattern

Across the four, 15 of 30 seeded mutations survived. The defects sit in the unglamorous layer (tables, input parsing, boundary terms) that the happy-path tests never touch. A mutation-survival check in each project's own test run would have flagged this at build time.
