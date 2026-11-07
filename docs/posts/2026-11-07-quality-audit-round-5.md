---
title: "Quality audit, round 5: none of six randomly drawn projects met the bar"
seo_title: "Quality audit round 5: 0 of 6 at a senior professional's bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07-d: a flagship, two ventures, two research projects and a platform directory, graded on seven dimensions. None met the bar; the common gaps are unbacked claims and tests that restate the code."
---

Round 5 drew with seed `2026-11-07-d`. Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/).

## The number

**0 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 0 of 5 met it; with this sample size the 95% Wilson interval for that share is roughly 0 to 43%, so the round says little about the population by itself. Across all 29 audits to date, 6 meet the bar. Four of the six here are finished (completeness 3 or more); home-inspection-report-builder and platform/deploy are not.

| subject | verdict | worst defect |
|---|---|---|
| `ventures/changepoint-detector` (flagship) | finished, not at the bar (claims 2, craft 2). 291 tests pass; an independent exact DP matched the engine on coal-mining, Lake Huron, airmiles and Nile. | README says the meanvar minimum segment is 5; the code default is 10. A README entry is dated 2026-11-09, two days ahead. |
| `ventures/home-inspection-report-builder` | not finished, not at the bar | Page promises a report sorted safety-first; the report groups by system. Bad costs and unknown severities are silently coerced (an unknown severity becomes "info"). |
| `ventures/well-pump-bid-calculator` | finished, not at the bar (claims 2). Three configurations recomputed in Python matched to the cent. | Extra drop-pipe footage billed as labor only, no pipe material; cable is a flat $1.85/ft whatever the horsepower. |
| `research/sequential-slashing` | finished, not at the bar (verification, craft, claims, fitness, domain all 2) | No test checks that the headline mixture e-process is valid: dropping a `/K` makes its false-slash rate 0.35 and only one test failed, by accident. No related-work list. |
| `research/partial-participation` | finished, not at the bar (verification 2) | A 10% error in `c_factor`, which sets the stability limit, passed 11 of 11 tests. No external literature cited. |
| `platform/deploy` | not finished, not at the bar (verification 2, claims 2) | One contents-API PUT per file starts many workflow runs; apps over 60 files or 3 MB are silently left out of the catalogue. |

## What a reader should take from it

- **Claims are the weak dimension again** (mean 2.28; 9 of 29 subjects at 3 or more). Numbers were mostly right; the prose around them drifted from the code.
- **Tests restate the implementation.** In both research projects a seeded mutation of a core constant or factor survived. Self-consistent tests do not pin a value to a source the author did not write.
- **Research write-ups cite nothing.** Neither whitepaper has a reference list, so novelty against federated-averaging partial-participation work and sequential calibration testing is unassessed. The auditors named nearest prior work from memory without verifying the citations.
- **Limits of this round.** Auditors did not drive the pages in a real browser. The well-pump calculator is a pricing tool, so its only independent source was hand arithmetic, not a published standard.

## What changed

Fixed in this PR (docs only): the changepoint-detector README minimum segment (5 to 10) and test count (47 to 291), and the well-pump FAQ, whose 57.6% is a share of total cost including overhead, not direct cost. A caught error in the audits themselves: the changepoint auditor cited an `index.html` FAQ for the wrong minimum segment, but only the README has it; the audit file now says so. The other defects are open and listed in each audit file. Scores here are before those fixes; a later round re-audits.
