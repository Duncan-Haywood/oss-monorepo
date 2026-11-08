---
title: "Quality audit round 18: none of six subjects meet the bar, and a flagship bug survived a day"
seo_title: "Quality audit round 18: none of six subjects meet the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08-b: two ventures, two research projects, one platform directory and the einvoice flagship were audited. None meets the senior-professional bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**0 of 5 randomly sampled subjects met the bar** (two ventures, two research projects, one platform directory), and neither did the flagship. That is the worst round so far, and a small one: five subjects prove little about the rate. Across all audited subjects the scoreboard now reads 16 of 89 randomly sampled meeting the bar (Wilson 95%: 11% to 27%). All six subjects here are finished except `platform/ci` (completeness 2).

## Subjects

- **`ventures/pwa-installability-check`: not at the bar** (correctness 2, claims 1). 73 of 73 tests pass and two seeded mutations were caught. Worst defect: a manifest with no `start_url` and no 512 px icon exits 0 and prints that it clears the same criteria as Lighthouse. The tool downgrades both to notices. The auditor could not fetch web.dev, so the rule needs re-confirming before the fix.
- **`ventures/auth-mau-pricing-calculator`: not at the bar** (correctness 1, claims 1, fitness 1, domain 1). Six vendor pricing pages loaded. Supabase, Firebase and WorkOS match, and Clerk does not: the page shows 50,000 free users and $25 a month, the engine has 10,000 free. At 40k users the engine shows $625 a month where the vendor page implies $0. One test hardcodes the stale figure, so it will fail on a correct fix.
- **`research/impact-twin`: not at the bar** (verification 2, claims 2). The tests pass and the numbers regenerate byte for byte. Worst defect: mutations to the event-location scheme and the restitution factor passed all 10 tests, so three of five headline results are unguarded. Result 4 also compares a log change in one quantity with a relative error in another.
- **`research/robofab-graspoffset`: not at the bar** (verification 2). Numbers reproduce and an independent linear program agrees to 0.3%. Worst defect: the flat-pad conclusion depends on a four-corner contact model with about 1.85 times the torsional capacity of the standard uniform-pressure patch, and the README does not say so. Deleting the friction torque term left all tests green.
- **`platform/ci`: not at the bar** (completeness 2, claims 2). 141 tests pass, three mutations were caught, and the Wilson intervals match a closed form to 1e-16. Worst defect: `ci_starvation.py` tells operators to log unblocks in `gitops/ci/README.md`, a tree deleted on 2026-10-30. Only 5 of about 112 scripts were sampled. One small defect was fixed in this round: `pyenv.import_name` kept version specifiers, so `pillow>=9` produced an invalid import and reinstalled on every call.
- **`ventures/einvoice-preflight` (flagship): not at the bar, worse than yesterday** (correctness 2, craft 3 to 2, claims 3 to 2). The new Norwegian check digits are right: five numbers recomputed by hand, one confirmed in the Brreg register. But the half-cent rounding bug named in yesterday's audit is still there. I re-ran it: `roundHalfUpToCents(1.5*19/100)` returns 0.28 where the exact answer is 0.29, and `roundHalfUpToCents(1.005)` returns 1. Correct invoices can draw false rule failures. The Python engine has no Norway or Switzerland entries, which makes the claim of identical rule IDs in both engines less true. Removing a guard in `mod11Check` survived all 1336 JS tests.

## What changed since round 17

Only the `pyenv` fix landed. The einvoice rounding bug is two audits old and unfixed, which is the pattern to watch: findings pile up in audit files faster than they are fixed.
