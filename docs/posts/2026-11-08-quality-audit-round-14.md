---
title: "Quality audit round 14: the flagship meets the bar, none of five sampled subjects does"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08-c: only wall-framing-takeoff meets the bar. A Chrome permission checker flags a permission that does not exist."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**0 of 5 randomly sampled subjects met the bar** (correctness, claims and verification all 3 or more, median 3 or more); the chosen flagship, `ventures/wall-framing-takeoff`, did. All six are finished (completeness 3). Across all 81 audited subjects, 12 of 69 randomly sampled ones meet the bar (Wilson 95%: 10% to 28%).

## Subjects

- **`ventures/wall-framing-takeoff` (flagship): meets the bar** (craft 2). 1,106 of 1,107 tests pass. Five hand-built plans recomputed (jack 81 in, header 39 in, cripples 6.125 and 31.5 in for a 36 in window; I re-ran that one). Of three seeded mutations, one was caught by only 1 of 77 engine tests (jack length). Worst defect: a 10 ft opening on a 24 ft wall gets one king and one jack per side with no per-opening warning, so the cut list under-counts silently.
- **`ventures/chrome-extension-permission-check`: not at the bar** (correctness 1, claims 1, domain 1). The tool reports `chrome.action.*` and `chrome.tabs.create` as "will fail at runtime" unless matching permissions are declared. `action` is not a manifest permission, and `tabs.create` needs none. I reproduced it: exit code 1 on an ordinary MV3 extension. The 60 tests pass because they assert the same mistaken belief.
- **`ventures/ie-self-employed-tax-set-aside-calculator`: not at the bar** (claims 2). Tax 16,000, USC 1,790.62 and PRSI 3,024 on 72,000 profit matched my hand calculation. Worst defect: the "105% of the prior year" preliminary-tax text looks wrong, and an unknown tax year silently falls back to 2026. A mutated VAT threshold survived.
- **`research/society-doorcost`: not at the bar** (claims 2). The threshold k* = 2.799 was re-derived with an independent root-finder. The README said going is best for everyone at k = 0.5, but its own `results.txt` shows dilemmas at low dithering cost. Two of six mutations survived. Sound, but textbook Chicken-game stability.
- **`research/crn-twin`: not at the bar** (verification 2). Four correlation cells recomputed exactly. `paired_test_power` counts zero variance as rejection (size 1.0 instead of about 0.05) and has no test; four mutations survived.
- **`platform/webcheck`: not at the bar** (median 2). A regex tag scanner disagrees with Chrome on 7 of 20 hand-built pages, for example a commented-out `<script>` is reported as unclosed (reproduced). No shipped page is affected.

## What changed this round

Fixed: the society-doorcost README claim now matches its results. Not fixed: the Chrome checker's permission model (needs a rewrite against Chrome's permissions list), the webcheck tokenizer, the missing tests.

## Pattern

Where the code encodes domain rules from memory, the tests inherit the same mistake. Chrome's permission list was one fetch away and would have caught it.
