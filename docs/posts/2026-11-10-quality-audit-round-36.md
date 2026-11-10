---
title: "Quality audit round 36: none of four sampled subjects meets the bar, and a FAQ promise failed"
seo_title: "Quality audit round 36: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of four sampled subjects meets the senior-professional bar. All fail on verification: seeded bugs survive the tests. One page promised too much."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Mode `sample`, seed 2026-11-10 (the draw after the earlier rounds of the day landed).

## The number

**None of the four sampled subjects meets the bar** (two ventures, two research projects). All four are finished (completeness 3) and all four have correct numbers on recomputation (correctness 3). Every one fails on `verification`: of 25 hand-seeded bugs in core logic, 12 survived with the tests green.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| `ventures/ghost-members-export-analyzer` | 3 | 3 | 1 | 3 | 3 | 2 | 2 | no |
| `ventures/tournament-pairing-manager` | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| `research/jitter-twin` | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| `research/qual-register` | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

## Verdicts and worst defects

- **ghost-members-export-analyzer.** An independent Python implementation matched every output on a 300-row export. But 5 of 7 seeded mutations survived 27 green tests: the engagement cutoffs, the quiet-age boundary, the minimum-sends rule and the conversion denominator are all unpinned. The code uses `>` where the page says "at least" 90 days. The tool also cannot export the quiet members it counts, which is the job.
- **tournament-pairing-manager.** Standings, Buchholz and Sonneborn-Berger match an independent implementation exactly, and with colours off the pairing equals the brute-force optimum in 1,200 of 1,200 rounds. Worst defect (high): the FAQ said that over a six-round event nobody gets three of one colour in a row. In 150 simulated colour-balanced events, 73 broke it. 5 of 9 mutations survived, including the default tiebreak order and the Buchholz-cut direction. Byes are ignored in tiebreaks, unlike FIDE C.07.
- **jitter-twin.** `results.txt` regenerates byte-identically and an independent Kronecker-operator implementation reproduces the headline values. No test runs the almost-sure analysis with persistence above zero, and transposing the transition matrix passes every test. The result is standard Markov-jump-linear-system analysis; Nilsson et al. 1998 and Zhang, Branicky and Phillips 2001 are not cited. The whitepaper title says "halves" the margin; the data show a 38% fall.
- **qual-register.** Regenerated from GoEmotions, the results are identical, and an independent recomputation agrees. Two of six mutations survived (the z-statistic denominator and the agreement/error count). The headline says a hand-coded sample "could not detect the small difference that was there", but that 1.9-point difference is not significant even on all 3,188 items (z = -1.21).

## What changed

One fix landed with this round: the tournament page FAQ no longer promises "nobody gets three in a row" (it says the search penalises runs and cannot guarantee it) and says "about a hundred" random events, with a test pinning the removed sentence. The other defects are in the audit files' `defects` and are not fixed here; the cheapest of them are boundary tests that would kill the 12 surviving mutations.

## What is not at the bar

All four. The pattern matches earlier rounds: right numbers, thin tests. Tests written by the author check what the author believed, and boundaries and unequal-group cases are where they stop.
