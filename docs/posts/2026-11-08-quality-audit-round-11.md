---
title: "Quality audit round 11: two of six at the bar, and a tax cap scaled by the wrong number"
seo_title: "Quality audit round 11: two of six at the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08, six subjects: a mileage calculator and devstats meet the bar; a vehicle depreciation calculator scales a Section 179 cap by business use."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**2 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 2 of 5. Across all 65 audits, 9 of 55 randomly sampled subjects meet the bar (Wilson 95%: 9% to 28%). Five of six are finished (completeness 3 or more); all six scored completeness 3.

## Subjects

- **`ventures/mileage-deduction-method-calculator`: meets the bar.** 27 of 27 tests pass; standard $7,390, actual $7,625, 83.3% business use and the 14.13% SE rate were recomputed by hand; three seeded mutations were caught. Worst defect: no lease rule (the standard rate must cover the whole lease), and the 76-cent July rate could not be checked against irs.gov from the sandbox.
- **`platform/devstats`: meets the bar.** 24 of 24 tests pass, merge and run counts match independent awk/Python recomputes. Four of five mutations were caught; `redSince ??= t` changed to `redSince = t` survived. Worst defect: revert counts are keyword matches that false-positive, and metrics labelled DORA use different definitions.
- **`ventures/business-vehicle-depreciation-calculator`: not at the bar** (correctness 2, claims 2). Passenger-car caps match Rev. Proc. 2025-16 and Pub 946. But for heavy SUVs, `engine.mjs:96` multiplies the Section 179 cap by the business-use share. The auditor's hand figure for $80k at 90% is $39,440 in year one against the page's $36,936, and the on-screen note and the amount used disagree. No test covers a heavy SUV below 100% business use.
- **`ventures/open-tennis-robots` (flagship): not at the bar** (verification 2, claims 2). Physics reproduces, 38 Python and 21 Node tests pass, yet a 30% change to the Magnus lift constant and a doubled catch-net width both left every test green, so the README's catch-rate table is unprotected. Firmware `SET_BASE` is not clamped although `safety.md` says limits are enforced.
- **`research/twin-recalibration`: not at the bar** (verification 2). Paper numbers recompute, but two mutations (the drift term and a 1.1x cost) survived all 10 tests, and the "37 to 200 times worse than Kalman" headline compares a failure-constrained schedule with an unconstrained twin.
- **`research/selfrep-dpgrid`: not at the bar** (claims 2). An independent DP matches `results.txt` to the digit, but in every case the best switch is "never stop copying", so "bang-bang is not beaten" is trivial, and "about 0.15%" is the best case (worst 0.26%). The sibling `selfrep-exactdp` supersedes it.

## Pattern

Four of six had a seeded mutation survive their tests. Three of the four failures on the bar trace to a headline number no test pins. Several `llms.txt` and `pyproject` files still point at the retired github.io host.

## Changed since last round

Round 10 had 0 of 6. The two passes here are the first venture and platform passes in two rounds. Nothing was fixed in this round: defects are recorded in the audit files and will be re-audited in later rounds.
