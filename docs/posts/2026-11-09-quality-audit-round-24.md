---
title: "Quality audit round 24: four of five subjects meet the bar"
seo_title: "Quality audit round 24: four of five subjects meet the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-09: two pricing calculators, two research projects and the wall-framing flagship. Four of five meet the senior-professional bar; qual-real does not."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

Of the four randomly sampled subjects (two ventures, two research projects), **three meet the bar** (n = 4, so the interval is very wide, roughly 30% to 95%). The flagship, wall-framing-takeoff, also meets it. Across all rounds the repository-wide share of sampled subjects meeting the bar is 22 of 115 before this round (Wilson 13% to 27%); this round is far above that, which says more about this draw than about a change in quality.

## Subjects

| subject | meets bar | worst defect |
|---|---|---|
| `ventures/window-cleaning-bid-calculator` | yes (domain 2) | minutes-per-pane presets and the "3 to 4 times the labor" claim cite no source; no crew-size input |
| `ventures/gutter-guard-bid-calculator` | yes (domain 2) | no material waste, markup or sales tax, so the walk-away price understates cost |
| `research/marriage-divorce-evidence` | yes | the README's "typical engaged couple" sits at the 2nd percentile of NSFG risk (12.5% against a 28% median) |
| `research/qual-real` | **no** (median 2, verification 2) | the headline "naive coder 13.3% vs human 25.3%" depends on a threshold tuned on the training items; a held-out threshold gives 21.3% |
| `ventures/wall-framing-takeoff` (flagship) | yes (craft 2) | a 10 ft door gets one king and one jack per side with no per-opening warning, open since 2026-11-07 |

Checks that were run: the window-cleaning suite (124 pass, rerun by me), gutter-guard (150 pass), marriage-divorce (84 Python and 158 Node pass), wall-framing (1139 of 1140 pass, 1 skipped). Hand recomputations matched for the two calculators and the framing layouts. The competing-risks engine in marriage-divorce matched an independent Python reimplementation to 1e-15.

## What is not at the bar

`qual-real` fails on verification: of four mutations seeded into `qualreal.py` (majority rule `>` to `>=`, naive-Bayes smoothing, the minimum-gold guard, the accuracy denominator), only one was caught by a test. Its headline number also moves by roughly eight points depending on how the threshold is chosen, which the README does not say. Prediction-powered inference is implemented with a fixed weight of 1, and the nearest prior work (PPI++, Egami et al. 2023, Hopkins and King 2010) is not cited.

None of the three ventures or research results that met the bar has been used by a real operator: the calculators are still prototypes with untested hypotheses.

## What changed since the last round

The flagship's scores are flat against round 3: four commits landed (input refusals, a winder kerf fix) and none addressed the open defects. One small fix ships with this round: the `llms.txt` files of both calculators pointed at the retired github.io address and now point at marisstella.app. The other defects are recorded in the audit files for the next round.
