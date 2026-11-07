---
title: "Quality audit round 6: one of six at the bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07: six projects graded on seven dimensions. Only platform/distribution met the bar; a rounding bug in the e-invoice flagship and a classifier whose tests catch nothing were the worst finds."
---

Round 6 drew with the plain seed `2026-11-07`. Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/).

## The number

**1 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 1 of 5 met it; with five subjects the 95% Wilson interval is wide, roughly 4 to 62%. Across all 35 audits to date, 7 meet the bar. All six are finished (completeness 3 or more). All scores are before any fix.

| subject | verdict | worst defect |
|---|---|---|
| `ventures/einvoice-preflight` (flagship) | finished, not at the bar (correctness 2, verification 2). 1333 JS tests (50 skipped), 358 Python tests; IBAN, VAT, SIREN and Leitweg checks matched independent recomputation. | `roundHalfUpToCents` uses `Math.round(x*100 + Number.EPSILON)`, which does not repair float error: an input of exactly 0.285 returns 0.28, not 0.29, so a correct invoice can draw a false totals error. The auditor counted 1,399 of 1,399,993 (net, rate) pairs wrong and found the Python port disagrees with the JS engine. Changing the INV-011 limit passed every test. |
| `ventures/mcp-supply-chain-watch` | finished, not at the bar (verification 1) | Both seeded mutations survived, including "never detect a schema change". A prompt-injection added inside an `inputSchema` property description is only a REVIEW, not an ALERT. Exit code is always 0. |
| `ventures/wedding-day-timeline-builder` | finished, not at the bar (verification 2, claims 2). Sunsets, hair/makeup makespan and portrait blocks recomputed by hand. | The page promises sunset portraits "about 30 minutes before sunset"; the tool's own sample day puts them 65 minutes before. Two portrait-block constants can be changed with all tests passing. |
| `research/build-data` | finished, not at the bar (correctness 2, claims 2). Raw-data pulls were blocked by the proxy, so headline numbers were recounted from result files only. | Issue-to-completion targets are right-censored (only finished permits) and the paper does not say so. Row counts differ across README, paper and manifest. |
| `research/robofab-cell-fesc` | finished, not at the bar (verification 2, craft 2, fitness 2, domain 2). An independent simulation matched the chain within 0.1%. | An off-by-one in the aggregation step survives all 5 tests. The 0.3% headline error holds for one inspector speed; a sibling project finds -2% to -5% peaks. Little prior work cited. |
| `platform/distribution` | **meets the bar**, all seven at 3. npm, PyPI and WebExtension outputs were built and installed; live publishing is gated on repo variables and secrets. | Package homepage is still the retired github.io host. `tomllib` is allowed but `requires-python` is `>=3.9`. A homebrew description-length mutation survived. |

## What a reader should take from it

- **Verification is again the weak spot behind wrong numbers.** In four of six subjects a seeded mutation of core logic passed the tests.
- **A flagship can fail on correctness.** The e-invoice checker's other checks agree with independent sources; one shared rounding helper is what pulled the score down.
- **Limits of this round.** I re-ran one claim myself: `0.285` through the rounding helper gives 0.28 as stated, but the auditor's exact 1.50 at 19% example depends on how the tax is computed upstream and gave 0.29 when I multiplied directly. The distribution audit scores verification 3 despite one surviving mutation; a stricter reader might give 2. The build-data and wedding almanac checks rest partly on recounting or memory.

## What changed

Nothing in the audited projects is fixed in this PR; the defects are open and listed in each audit file, and a later round re-audits. Previous rounds' share meeting the bar was 6 of 29.
