---
title: "Quality audit round 12: one of five audited subjects at the bar, and an empty directory in the sample"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08, six subjects: only an exact-DP research project meets the bar; a flagship, two ventures and a statistics project miss on claims or verification; platform/skills is an empty placeholder."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**1 of 5 audited subjects met the bar** (correctness, claims and verification all 3 or more, median 3 or more); the sixth, `platform/skills`, could not be audited. Of the four randomly sampled non-flagship subjects that were audited, 1 of 4. Across all 71 audit files, 10 of 59 randomly sampled subjects meet the bar (Wilson 95%: 10% to 28%). All five audited subjects are finished (completeness 3).

## Subjects

- **`research/selfrep-exactdp`: meets the bar.** Five tests pass, `experiments/run.py` reproduces `results.txt`, and the auditor recomputed the closed form (50 * 1.02^600 = 7,228,914.06, which I re-checked), the best-switch scan and an independent memoised DP. Worst defect: the "one switch is optimal at c=1e3, s=12.5" bullet was never run at m=16; a free-control optimiser finds at least 0.66% more. Novelty is thin: the structure is classical Pontryagin.
- **`ventures/mini-golf-course-profit-calculator`: not at the bar** (claims 2). Every figure of the sample scenario recomputed to the cent (loan payment $34,127.16, which I re-checked). Worst defect: `sitemap.xml`, the `robots.txt` sitemap line and the canonical link are relative, so crawlers ignore them, and `llms.txt` points at the retired github.io host.
- **`ventures/buymeacoffee-payout-to-journal`: not at the bar** (claims 2). Month-straddling and refund journals matched hand arithmetic; two seeded mutations were caught. Worst defect: `incomeCategory` tested "support" and "coffee" before membership and commission, so "Membership support" became a donation. Fixed in this PR with a test; the export layout has never been checked against a real export.
- **`ventures/chant-forge` (flagship): not at the bar** (verification 2, claims 2). 83 of 83 tests pass and the Dies irae MIDI and loudness (-16.6 LUFS) recompute. But changing the loudness relative gate from -10 LU to -20 LU left all of `master.test.mjs` green, `llms.txt` still says "8 unit tests" and "no mastering tooling", and two corpus pieces (1961, 1974) break the project's own pre-1929 rule (disclosed).
- **`research/twin-shrinkage`: not at the bar** (verification 2). Exact James-Stein risk matches an independent integral to four decimals. Two of three seeded mutations (the block-merge threshold, a doubled variance term) survived all 7 tests, so two headline results are untested. The result is classical Efron-Morris territory with a new label.
- **`platform/skills`: unauditable.** The directory holds a zero-byte `.gitkeep`. That is a finding about the sampler too: an empty placeholder consumes a draw from the platform population.

## Pattern

Three of five audited subjects had a seeded mutation survive. Two ventures share the same distribution-file defect (relative sitemap URLs, stale github.io links) that earlier rounds also found. The sampler should skip empty directories.
