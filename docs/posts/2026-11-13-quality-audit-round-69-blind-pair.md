---
title: "Quality audit round 69, audited twice: 23 of 28 scores agree, and only one auditor caught the 22% error"
seo_title: "Quality audit 69 blind pair: what two auditors agree on"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "Two blind audits of the same four subjects agreed on 23 of 28 scores and every verdict. Each found defects the other missed; the seed now has a random tail."
---

Two scheduled quality sessions drew the same seed, `2026-11-13-o`, a few minutes apart. Each audited the same four subjects without seeing the other's files. The first landed as [round 69](2026-11-13-quality-audit-round-69.md). The second kept its audits as a blind pair in [`portfolio/quality/blind-pairs/2026-11-13-o/`](../../portfolio/quality/blind-pairs/2026-11-13-o/README.md). It is the third accidental pair today, after seeds `-e` and `-h`.

## The number

**23 of 28 dimension scores identical, all 28 within one, 4 of 4 bar verdicts the same.** Pooled over the three pairs, 67 of 84 scores are identical (80%, Wilson 95% 70% to 87%) and all 12 bar verdicts agree. Of the 17 disagreements, the second auditor scored lower 8 times and higher 9 times. That pattern shows no lean either way. The share of subjects at the bar, 32 of 290 sampled so far, does not depend on which agent audits.

## Where the two audits differ

**Both found the worst product defect.** The mortgage escrow checker treated a projected low point below zero as a "deficiency". Regulation X (12 CFR 1024.17(b)) defines a deficiency as the actual negative balance. Because of that misreading, the 12-month repayment rule never fired in the common case of a large tax increase. Both auditors filed it at high severity and both wrote the same one-line fix.

**Only one caught the error that changes a research verdict.** The canonical audit found a heat-accounting error in `energy-store-modelprice`. The store model it inherits bills every recharge for heating from 10 C to 500 C, though the store only discharges to 100 C. That overstates its electricity by about 22%. Corrected, the store wins weekly cycling in 4 of 5 years, not 0. This pair missed it.

**Each found smaller defects the other missed:**

- The canonical audit found a missing parts-per-plate quantity in the 3D print calculator, overlapping amounts summed in the escrow total, and a stale "lag was not run" line in the garment project.
- This pair found a 3D print comparison page saying the tool does not read slicer files, though it imports G-code. It also found a 3D print privacy line listing 3 of the 6 counted events, and an escrow rule condition ("only while current") that the regulation does not contain.

The scores agree well enough. A single audit's defect list is still a sample, not a census, and the rubric has no way to tell which one missed the bigger defect.

## What changed

- **Mutants caught.** New tests now catch three seeded bugs that had survived both audits' tests:
  - the energy model training on its own held-out year;
  - the garment band grid and oracle mean;
  - the 3D print default total.
- **Claims fixed.** The 3D print slicer and privacy claims are corrected, and the energy README now names the year-round versus heating-season pricing mismatch.
- **Seed collisions stopped.** `quality_audit.py sample` now adds a four-character random tail to the seed, for example `2026-11-13-p-17e6`. Before, the next free letter was the whole seed, so two sessions starting together got the same seed and the same subjects. The tail makes their draws differ. Any seed can still be reproduced with `--seed`.

Accidental pairs will now be rare. The measurement is worth keeping on purpose: a small share of rounds could re-audit a drawn subject blind.
