---
title: "Update a camera calibration unless the new estimate agrees within half a standard deviation"
seo_title: "When to update a robot camera's calibration from self-calibration"
date: 2026-11-21
tags: [research, sensing-selfcal, camera-calibration, decision-rules]
description: "On TUM video, replacing a held focal length unless pooled self-calibration agrees within 0.5 sd beats both a 2-sd change test and always adopting."
---

The previous step of the `sensing-selfcal` programme
([an honest error bar cannot see a stale calibration](2026-11-20-an-honest-error-bar-cannot-see-a-stale-camera-calibration.md))
found that a 2-sd change test on pooled camera self-calibrations needs 7 to
10% focal-length staleness before it fires reliably. Keeping the held value
until the test fires leaves up to 4.5% error, while simply adopting the
five-window pool leaves 1.2%. That suggested the decision rule was the
problem, not the error bar.

This step scores update rules by the error each one leaves the robot holding,
not by how often it raises an alarm. It uses the same 43 windows of TUM RGB-D
video (saved solves, nothing re-solved) and the same held value: the board
calibration shifted by 0 to 10%. There are eight rules: never adopt, always
adopt, adopt when the pool is more than c standard deviations from the held
value (c = 0.5, 1, 1.5, 2, 3), and a positive-part empirical-Bayes blend that
moves the held value toward the pool by a weight of 1 − sd²/d². A rule's
*regret* at each staleness is its median error minus the better of "always"
and "never" at that staleness. The seven predictions went into the
[log](../../research/sensing-selfcal/LOG.md) before the script was written.

## What came out

With five pooled windows and the causal prior:

| rule | worst regret (points) | median error, right calibration | worst 95th percentile |
|---|---|---|---|
| 2-sd gate (milestone 3v) | 3.33 | 0.0% | 10.0% |
| always adopt | 1.17 | 1.17% | 2.9% |
| blend | 1.77 | 0.0% | 6.7% |
| **adopt unless within 0.5 sd** | **0.42** | **0.0%** | 4.0% |

The half-sd rule is minimax against all three references the programme
keeps (board, TUM's own, target-free). It keeps a right calibration exactly,
because a right held value usually sits inside half a bar of the pool, and it
replaces a stale one almost every time. Its worst case is a 2% staleness that
it keeps about half the time.

With one to three windows the blend wins instead: worst regret 0.82 points at
three windows (always adopt 2.10, the 2-sd gate 2.67) and 1.49 at one. Across
all twelve combinations of model and window count, the better of these two
rules beat both always-adopt and the 2-sd gate on worst-case regret. Four of
the seven predictions held. The three that failed had guessed that a 1-sd
gate, or the blend, would do best at five windows, and that the blend's tail
would stay under 4%.

## What it does not show

The two winners were picked from eight rules on the same 31 overlapping
blocks they are scored on, so their margins are optimistic. The half-sd
rule's tail is heavier than always adopting (95th percentile 4.0% against
2.9%). Staleness here is a shifted held value, not a real lens change, and the
board reference is itself about 1.6% from the other two. The next step is to
pick the rule on one camera and score it on the other.

Code: [`experiments/m3w_update/analyse.py`](../../research/sensing-selfcal/experiments/m3w_update/analyse.py);
project page: [sensing-selfcal](../../research/sensing-selfcal/README.md).
