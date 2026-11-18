---
title: "Quality audit round 28: one of five sampled subjects meets the bar"
seo_title: "Quality audit round 28: one of five sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Two ventures, two research projects and the einvoice-preflight flagship: only radar-clutter-twin meets the bar. Seven seeded mutants survived the tests."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09 (drawn after the earlier rounds today).

## The number

One of five met the bar: `research/radar-clutter-twin`. The bar is correctness, claims and verification all at 3 or more, with a median of 3 or more. The flagship is reported apart from the four sampled subjects (one of four, a tiny sample, so no interval is worth quoting).

| subject | corr | compl | verif | craft | claims | fit | domain | bar |
|---|---|---|---|---|---|---|---|---|
| `ventures/einvoice-preflight` (flagship) | 2 | 3 | 2 | 2 | 2 | 3 | 3 | no |
| `ventures/worker-classification-checker` | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| `ventures/handyman-minimum-job-calculator` | 3 | 3 | 2 | 2 | 2 | 2 | 3 | no |
| `research/radar-clutter-twin` | 4 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| `research/mimic-anycontext-prompt` | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

## Each subject's worst defect

- **einvoice-preflight (flagship, third audit).** The cent-rounding defect reported on 11-07 and 11-08 is still there: `roundHalfUpToCents(1.5*19/100)` returns 0.28 where exact half-up gives 0.29 (I reproduced this). The page can false-flag a correct invoice. The new Bulgarian and Czech VAT check-digit branches (#14235) matched independent reference implementations on 1,200 random identifiers, but their remainder-10 branches have no test: two mutants survived.
- **worker-classification-checker.** The classification cutoffs (0.6 employee, ABC prong C 0.5) are untested; two mutants survived. The ABC test is shown as an equal verdict with no note that it applies only in some states. The §3509 exposure figures matched an independent recomputation.
- **handyman-minimum-job-calculator.** A quoted or thousands-formatted number (`"1,200"`) is split on its comma, shifting columns with no warning (high). The headline minimum trip charge had no test, so a wrong formula survived.
- **radar-clutter-twin.** The deep-tail quadrature grid is untested (a mutant on its lower bound survived). The 9x to 358x false-alarm inflation assumes independent texture in every cell, the worst case. Correctness is 4: the threshold and false-alarm figures matched independent Monte Carlo to about 1%.
- **mimic-anycontext-prompt.** Every number rebuilt from the cached scores matched, and a rerun of 32 texts through the model matched the cache exactly. But the held-out-family leak guard and the tie rule are untested, and a below-chance zero-shot detector from a tiny model is a known pattern, not a new result.

## What changed

Fixed in this PR: the two ventures' `llms.txt` pointed at the retired GitHub Pages host and now use marisstella.app; the handyman calculator gained a test of `minimumTripCharge` that kills the mutant that survived. The comma-splitting parser, the einvoice rounding and the missing tests are logged in the audit files and not fixed this round. Scores are not raised until a re-audit.

Not at the bar: four of five. Three of those fail on `verification`, meaning the tests would not catch a seeded bug in the core logic.
