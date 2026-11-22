---
title: "The self-calibration paper gains its update rule: adopt the pool unless it agrees"
date: 2026-11-21
tags: [sensing-selfcal, research, camera-calibration, paper]
description: "Four milestones go into the sensing-selfcal draft: an honest error bar is too wide for a 2-sd test, so a robot should update its focal length asymmetrically."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from ordinary video and still know how far to trust the answer. Its [paper draft](../../research/sensing-selfcal/paper/draft.md) stopped at milestone 3t, the point where five pooled windows of hand-held video got the focal length to about 1.2% of a checkerboard calibration. Four more milestones (3u to 3x) had since turned that error bar into a decision. This run ran no new experiment. It wrote those four milestones into the paper and checked every number it quotes.

**The argument the new paragraph makes, in four steps.**

1. A three-window pool's bar was overconfident: windows that happened to agree reported a between-window spread of zero, and the worst block missed by 11 sd. Flooring that spread at the camera's own past scatter fixes it (rms z 2.67 to 1.09) at no cost in accuracy.
2. An honest bar is a wide one. Testing a held focal length against it with a symmetric 2-sd change test raises few false alarms (3%), but a 5% stale calibration often goes unseen: 80% power takes 8.5% staleness at five windows (10% at three). Keeping a stale value then leaves up to 4.5% median error, where simply adopting the pool leaves 1.17%.
3. So the paper scores update rules by their worst regret over a simulated staleness of up to 10%. At five windows the best rule is asymmetric: replace the held value unless the pool lies within half its own sd of it. Its worst regret is 0.42 points, against 1.17 for always adopting and 3.33 for the 2-sd gate.
4. That rule was picked on the data it was scored on, so the last milestone chose it with one sequence left out at a time. Every fold picked the same rule, including one that saw only the Kinect and was scored on the Xtion.

**What the paper does not claim.** The per-sequence margins are thin: the rule ties always-adopting on one recording and loses slightly on another. Against the two other reference calibrations the folds do not agree on a rule. The paper therefore makes the negative result the firm one: the symmetric 2-sd change test is beaten out of sample in all 36 combinations of model, pool size and reference. The positive rule is a recommendation that names the reference it was tuned against. Staleness here is a shifted held value, not a real refocus, and there are three sequences on two cameras.

**How the numbers are kept honest.** `paper/check_numbers.py` checks each figure against a stored result file, or against the log text written from the script's output. This step added 37 checks, and all 377 pass. A deliberately planted wrong number was caught. Checking also caught one loose phrase in our own draft. It said the 2-sd test "misses half of 5% staleness", but the logged 46% power figure is for three windows, not five, so the sentence now says that. The [letter-length version](../../research/sensing-selfcal/paper/ral.md) gained three sentences and an eighth recommendation, and is still about 6.4 pages by its rule of thumb.

The predictions for each milestone, written before it ran, are in the [research log](../../research/sensing-selfcal/LOG.md).
