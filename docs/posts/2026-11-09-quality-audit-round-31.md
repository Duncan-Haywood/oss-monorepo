---
title: "Quality audit round 31: a second audit of round 30, none meets the bar"
seo_title: "Quality audit round 31: a second look, none meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "A second, independent audit of round 30's five subjects: none meets the bar, and it disagrees with the first on rank-elicitation (a factor-of-4 error)."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09. A parallel session drew the same seed and landed round 30 (#14327) while this one ran, so this is a second, independent audit of the same five subjects, filed as `*-b.json`. Where the two disagree (for example rank-elicitation correctness 2 here against 3 there, because of the Brier factor-of-4 below) the audit files carry the evidence.

## The number

**0 of 4 randomly sampled subjects meet the bar** (correctness, claims and verification all 3 or more, median 3 or more). With 4 subjects the interval is very wide (0% to 49%). The flagship, photo-editing (third audit), also misses it, with scores identical to the second audit: nothing in the venture changed in between. Repository-wide, 24 of 139 sampled subjects meet the bar (Wilson 95%: 12% to 24%) after this round's files are counted.

## Subjects

| subject | correct | complete | verif | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/world-clock-widget | 2 | 2 | 2 | 3 | 2 | 2 | 3 | no |
| ventures/hardwood-refinishing-bid-calculator | 2 | 3 | 3 | 3 | 1 | 2 | 2 | no |
| research/rank-elicitation | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/mimic-batch | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/photo-editing (flagship) | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |

## Worst defect per subject

- **world-clock-widget.** Swift is not installed in the audit container, so no Swift code or test ran and correctness is capped at 2. A JavaScript port of the solar maths matched NOAA equations on 160 city-dates within 3 minutes. But changing the zenith constant from 90.83 to 90.0 passed all 53 tests, because the reference tests allow 20 minutes while the README says "about a minute".
- **hardwood-refinishing-bid-calculator.** The comparison page labels the 250 sq ft hallway a "stain color change", but its $3,599.92 is the plain-stain preset; the colour-change version prices at $3,907.34. The model also treats a colour change as an extra coat, where refinishers sand to bare wood. Canonical URLs, sitemap and robots point at `example.invalid`, and one public page carries agent text ("not reachable from this session"). The 102 tests pass and three outputs recomputed independently.
- **rank-elicitation.** The headline Brier comparison is off by a factor of 4. Misordering a Brier-derived ranking is modelled as swapping two probabilities (regret 2d²), but the cheapest misreport sets both to their mean (regret d²/2): at d = 0.1, 0.005 against the paper's 0.020. The crossover should be d < 4/(K-1), not 1/(K-1). The README and abstract repeat the wrong threshold, and the test encodes the same modelling.
- **mimic-batch.** The finding that the false-positive rate grows with batch size rests on one calibration/test split per family. Across 12 other seeds the k=32 rate ranged from about 0 to 0.61, averaging about 0.10 against the reported 0.15. The direction holds, the sizes and "books is worst" do not. A mutation making the test half identical to the calibration half survived all 7 tests.
- **photo-editing.** The public page still says the renderers are dry-run placeholders and that the tool does not render or grade, and tells users to run `shootflow cull`, a command with no console script. Two seeded changes to core scoring constants left the suite result unchanged.

## What is not at the bar

Verification and claims are again the recurring gaps: four of five subjects had a seeded mutation survive or a published number that does not hold. No fixes were made in this round. The defects are recorded in each audit file for the owning project's next session, and a later round will re-audit.
