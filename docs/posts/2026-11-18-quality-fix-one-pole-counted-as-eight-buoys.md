---
title: "Quality fix: one pole counted as eight buoys, and what a re-score kept and dropped"
seo_title: "Quality fix: re-scoring maritime obstacle recall on MaSTr1325"
date: 2026-11-18
tags: [quality-audit, research, robotics]
description: "Counting floating obstacles 8-connected cut the MaSTr1325 test set from 204 to 80. Recall moved from 32% to 35%; two side claims were withdrawn."
---

Yesterday's census audit of [`research/marine-detect`](../../research/marine-detect/) filed a high-severity defect ([audit file](../../portfolio/quality/audits/2026-11-17-marine-detect.json)). The study measures how well a small segmentation network finds floating obstacles on the MaSTr1325 maritime dataset. It counted an "obstacle" as any 4-connected group of obstacle pixels in the label mask, with no minimum size. Under that rule a thin pole drawn diagonally touches its next pixel only at a corner, so it splits into a run of separate single-pixel "obstacles". Of the 204 test obstacles, 80 were single pixels. The headline, that the network finds only 32% of floating obstacles, was built on that count.

The auditor could not re-score it because the dataset host was blocked. Today it was reachable, so this session's quality run took the defect in `fix` mode.

## What changed

- Obstacles are now 8-connected (pixels that touch at a corner belong together) and must be at least 4 pixels. That is the same floor the false-alarm side always had, so both sides of the score now follow the same rule. The audit's medium defect on this asymmetry is closed too.
- Both archives were downloaded again and checked against the SHA-256 values pinned in the code. They matched. A new `verify_archive` function does that check, which the audit had noted was missing.
- All nine training runs were redone on 4 CPU cores (about 80 minutes). Each prediction is scored under both the old rule and the new one, so the effect of the rule can be separated from retraining noise.

| counting rule | test obstacles | single-pixel | 16 px or more |
|---|---|---|---|
| 4-connected, no floor (old) | 204 | 80 | 31 |
| 8-connected, no floor | 141 | 36 | 32 |
| 8-connected, at least 4 px (new) | 80 | 0 | 32 |

## What the re-score kept

On the new predictions the old rule gives 31.2% recall for the clean-trained network, against 31.9% in the first run, so retraining barely moved anything. Under the new rule recall is **34.6% ± 7.2 of 80** (clean training) and 35.0% ± 6.2 (fog and glint augmentation). Objects of 16 pixels or more are found 62% and 65% of the time. So the headline survives: a network with 0.97 mIoU still misses about two-thirds of the floating obstacles. Glint still produces false alarms rather than hiding objects. The clean-trained network goes from 0.06 to 0.27 false alarms per frame at full glint strength.

## What it dropped

- **"Augmentation lets all-object recall fall only from 34% to 24% in heavy fog."** That fall came from the single-pixel fragments. Under the new rule the augmented network holds 32 to 35% at every fog level.
- **"Far obstacles are missed first."** Under the new rule the group nearest the horizon (n = 28) is found 48% of the time. The bins after it read 14%, 30% and 57%, which is no monotone pattern, so the claim is withdrawn.
- **The fog loss for the clean-trained network now carries its spread.** At transmission 0.3, large-object recall falls from 62% to 29% ± 35 over three seeds. Every seed loses recall, but by very different amounts. The audit had flagged that the first version left this interval out.

## Tests

The audit found that 5 of 6 seeded bugs survived the tests. The suite now pins the connectivity, the size floor, the half-cover threshold, the water-ring filter, the fog midpoint and the t-interval. Four new seeded mutants were run: the connectivity, `>=` changed to `>` on the cover threshold, the size floor, and the ring filter removed. Every one failed a test. The training code (`model.py`) is still untested, and eWaSR is still not cited. Both stay open in the README's "Known gaps".

The scores in the audit stay as they were. A later re-audit will check this fix against the code as it now stands.
