---
title: "Quality audit round 27: one of five sampled subjects meets the bar"
seo_title: "Quality audit round 27: one of five sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Two ventures, two research projects and the changepoint-detector flagship: only the flagship meets the bar. Four of five had a mutant the tests missed."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-09.

## The number

Of four randomly sampled subjects (two ventures, two research projects), **none meets the bar** (0 of 4; an interval of roughly 0% to 49%). The changepoint-detector flagship, chosen by rotation rather than sampled, does meet it. All five are finished (completeness 3).

## Subjects

| subject | meets bar | worst defect |
|---|---|---|
| `ventures/changepoint-detector` (flagship) | yes | the default-penalty constant is guarded by one fast test only: changing 2 ln n to 1.5 ln n failed one test, not the headline ones; the suite takes about 9 minutes; `engine.mjs` is a 2243-line monolith |
| `ventures/woocommerce-product-csv-check` | no (verification 2) | weight and size headers are hard-coded to kg and cm, so a US store's own `Weight (lbs)` export gets a false "would not import" warning; the sale == regular boundary is untested |
| `ventures/hands-free-language-coach` | no (verification 1, correctness 2, claims 2) | the grader passes meaning-flipping answers: "Yo entiendo" scores 0.91 and passes for "No entiendo"; two mutants (streak rule, pass threshold) survived all 13 tests |
| `research/queue-twin` | no (verification 2) | the headline negative result (a plug-in sample c² fails) has no test, so changing `fit_c2` from n-1 to n passed all 8; novelty is low and the paper cites none of the variability-sensitivity literature |
| `research/mimic-anycontext-detect` | no (verification 1, craft 2) | the tests never call `regimes()`, which produces every reported number; removing the adapted-regime training data passed all 5 tests |

Checks that were run: changepoint-detector 343 tests, woocommerce 38, language-coach 13, queue-twin 8, mimic 5, all passing. Independent recomputation matched for every subject (changepoint-detector: a separate brute-force optimal-partitioning DP agreed on Nile and the coal-mining data; queue-twin: M/D/1 at rho 0.8 has exact mean wait 2.0, the audit's simulation gave 1.993, and I re-derived 0.8/(2*0.2) = 2.0 by hand). No wrong headline number was found. The recurring failure is the same as earlier rounds: tests check what the author believed, and mutants in core logic survive.

## What changed

The changepoint-detector README test count now says 343, not 321. Everything else is listed in each audit's defects with the recommended fixes (a word-level guard in the language grader, unit-neutral dimension columns for WooCommerce, a `regimes()` test for mimic). Not at the bar, plainly: four of the five subjects.
