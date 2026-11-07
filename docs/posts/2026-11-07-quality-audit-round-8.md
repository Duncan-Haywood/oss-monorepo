---
title: "Quality audit round 8: one of six at the bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07, six new subjects: one meets the bar. A public page says a working renderer is a placeholder, and a price typed as 1,200 is read as $1."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**1 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 1 of 5; with five subjects the interval is wide (roughly 4% to 62%). Across all 47 audits, 7 of 40 randomly sampled subjects meet the bar (Wilson 95%: 9% to 32%). All six are finished (completeness 3).

| subject | verdict | worst defect |
|---|---|---|
| `ventures/photo-editing` (flagship) | finished, not at the bar (verification 2, craft 2, claims 2). Ingest, the ffmpeg pipeline and the cull ran on synthetic media; file hashes, a hand-built LUT and frame metrics matched independent computation. | `site/index.html:40` says the renderers are dry-run placeholders and that nothing is rendered or graded, but the pipeline produced reels and graded masters. The page also tells users to run `shootflow cull`, which is not packaged. Shifting the exposure target 120 to 100 passes all tests. I read line 40 myself and the sentence is there. |
| `ventures/med-spa-treatment-profit-calculator` | finished, not at the bar (correctness 2, claims 2). 25 tests pass; three treatments recomputed. | A price typed `1,200` is read as $1 with no warning, contradicting "never dropped" (`calc.mjs:19-30`). The "40 to 55 percent" margin benchmark has no source. |
| `ventures/wedding-photographer-profit-calculator` | **meets the bar** (fitness 2, domain 2). 30 tests pass; six outputs matched an independent script; three seeded mutations were caught. | Overhead is spread over all bookable hours, not hours worked (`calc.mjs:61`), which flatters profit per hour at low utilisation. No tax modelling. |
| `research/buildbot-carrycop` | finished, not at the bar (verification 2). 10 tests pass; a 216-case slice of the sweep and an independent RK4 integration matched. | Flipping the sign of the CoP offset passes all tests. The headline gain is one grid cell at millimetre margins. The README says 6 tests; there are 10. |
| `research/robofab-cell-mva` | finished, not at the bar (verification 2, domain 2). Six MVA outputs matched exact-rational code; `results.txt` regenerates byte-identical. | The MVA-h predictor behind findings 3 to 5 is untested: changing `hold_printer` to load only passes all 8 tests. |
| `platform/marketing` | finished, not at the bar (craft 2, claims 2). 38 tests pass; three mutations caught. | URLs inside a child sitemap are not filtered to the declared host, so the IndexNow request would be rejected. No test covers it. |

## What a reader should take from it

- **Verification is again the weak spot in research**: both research subjects passed their tests with core logic changed.
- **A page that undersells the product is still an unbacked claim.** The flagship's page denies working features.
- **Limits.** No auditor loaded a page in a browser; the live photo-editing URL was unreachable through the proxy. Full sweeps (about 40 minutes for buildbot-carrycop) were sampled, not rerun.

## What changed

Nothing in the audited projects is fixed in this PR; defects are in each audit file for a later round to re-audit.
