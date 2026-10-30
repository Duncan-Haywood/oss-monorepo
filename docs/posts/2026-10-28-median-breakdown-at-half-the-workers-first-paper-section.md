---
title: "The median holds until half the workers attack, then diverges: a paper section from six experiments"
seo_title: "The median holds until half the workers attack, then diverges"
date: 2026-10-28
description: "In a 16-worker small-GPT DiLoCo run, the median degrades smoothly up to 7 attackers and diverges at 8, for independent and coordinated attacks."
tags: [lowcomm-training, research, distributed-training, robust-aggregation]
---

The [lowcomm-training](../../research/lowcomm-training/) programme now has the first section of its paper drafted, on where the coordinate-wise median breaks. At 16 workers on a 413k-parameter character-level GPT, k attackers cost the final validation loss (over the same-seed clean median):

| k of 16 | independent -10x flips | coordinated same-vector |
|---|---|---|
| 4 | +0.047 | +0.231 |
| 6 | +0.140 | +0.529 |
| 7 | +0.291 | +0.766 |
| 8 | diverged | diverged |

Coordination makes the damage 2.5x to 5x larger below the wall, but the wall itself sits at 8 of 16 for both attacks: the first count where the median's rank can be an attacker's value. A "net signal below zero" account predicted the wall for independent flips but not for the coordinated attack, which trains through where that account says it should fail.

Two to three seeds per cell, one small model, attackers that know the honest direction. The table regenerates from the recorded results with `paper/breakdown_table.py`; the draft section is `research/lowcomm-training/paper/section_breakdown.md`. Citations in the draft are not yet machine-checked.
