---
title: "Pooling a camera's self-calibrations: the prior and the pool are complements"
seo_title: "Pooling camera self-calibration windows with a causal prior"
date: 2026-11-19
tags: [sensing-selfcal, research, camera-calibration, self-calibration, meta-analysis, tum-rgbd]
description: "On real TUM video, five pooled windows with a causal k1 prior got the focal length within 1.17% (2.20% without), with an error bar as honest as before."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from short stretches of ordinary video, with no checkerboard, and still know how far to trust the answer. Earlier today, [milestone 3s](2026-11-19-a-camera-prior-from-only-its-past-windows.md) gave each 1.2-second window a soft prior on its lens distortion and principal point. The prior came only from the camera's earlier windows, and it cut the scatter from window to window by a quarter to a half.

A robot does not trust one window. It pools several. [Milestone 3d](../../research/sensing-selfcal/README.md) found that about eight windows, pooled by random effects, give the focal length to 2% with an honest error bar. This run asked whether the prior changes that. The worry was specific. Random effects reads the spread between windows as uncertainty. A prior that removes spread but leaves bias could make the pooled bar shrink faster than the error.

**What we did.** No new solves this time: the TUM data host refused the connection, so the run used the saved solves. Milestone 3s scored 43 windows, each solved three ways: no prior (est), a prior from earlier raw estimates (est_c), and a prior fed from its own steadied estimates (est_cr). We pooled runs of K = 1, 3, 5 and 8 consecutive windows in each sequence. Each run was pooled three ways: inverse variance, DerSimonian–Laird random effects, and random effects with the Hartung–Knapp–Sidik–Jonkman variance. Each pooled value was scored against the board calibration. The eight predictions were committed before the script was written ([LOG](../../research/sensing-selfcal/LOG.md)). Seven held.

**The pool gets much better with the prior.** With five windows pooled, the median focal error was **1.17%** with the causal prior and **2.20%** without it. The pool reached 2% at five windows instead of eight. At eight windows the error was 0.93% with the prior and 1.49% without. The share of five-window pools that were both within 2% and claimed 2% or better rose from 16% to 29%.

**The error bar stays honest at five windows.** Here our prediction was wrong. The random-effects rms z was 1.58 with the prior and 1.65 without, so the prior did not make the bar worse. (An rms z of 1 means the bar matches the miss.) Pooling as if the windows were independent was still off by a factor of about 15, prior or not, because each window's own solver sd is far too small.

**The cost shows up at three windows.** In three-window pools the worry came true: rms z rose from 1.61 without the prior to 2.67 with it. Three prior-steadied windows sometimes agree with each other more closely than with the truth. Random effects then estimates no spread between them and falls back on the solver's tiny sd. One such pool missed by 11 of its own standard deviations. The Hartung–Knapp variance, often recommended for small pools, made it worse (one pool at 122 sd), because it scales with that same near-zero spread. Its modified form with a floor did no better than plain random effects.

**What it means for a practitioner.** The prior and pooling do different jobs. The prior removes scatter, and pooling averages what is left. Pool at least five windows (about 6 seconds of video) and use random effects, never inverse variance on the solver's sd. Adding 1% of the focal length to the pooled sd in quadrature brought rms z to 0.93. That is about half the amount by which three reference calibrations of the same camera disagree.

**Limits.** The pools overlap, and windows that share a prior are not independent, so 31 five-window pools are far fewer than 31 independent tests. There are three sequences, two cameras and one recording order. The window sds are the solver's own, not the jackknife sds milestone 3d used. The Hartung–Knapp blow-up was examined after the scored result. The next step, once the data host answers, is to re-solve on the images: a bad-start test of the self-feeding memory, and a pooling rule that does not trust a zero spread from a few windows.

Code, results and figure: [`research/sensing-selfcal/experiments/m3t_poolprior`](../../research/sensing-selfcal/experiments/m3t_poolprior/).
