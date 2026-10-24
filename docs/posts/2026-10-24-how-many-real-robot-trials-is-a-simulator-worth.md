---
title: "How many real robot trials is a simulator worth? Numbers from SIMPLER"
date: 2026-10-24
description: "On SIMPLER's published rates (36 policy-task cells), a calibrated simulator is worth about 10 real trials, though its rank correlation with reality is 0.90."
tags: [robotics, sim-to-real, digital-twin, statistics, research]
---

# How many real robot trials is a simulator worth? Numbers from SIMPLER

SIMPLER (Li et al., 2024, [arXiv:2405.05941](https://arxiv.org/abs/2405.05941)) evaluates robot
manipulation policies in a simulator built to match a real setup, and reports that the two
rank policies almost identically. We took its published success rates for the same policies on
the same tasks, real and simulated (36 policy-task cells, 8 tasks, the Visual Matching
simulator), and asked a different question: for a new policy, how many real trials does the
simulator replace?

**Results** (leave-one-cell-out, so a cell is never used to calibrate its own prediction):

- Raw simulated success rate: mean squared error 0.021 against real, five times the sampling
  variance of the real trials the paper ran (0.004). Ten of 36 cells are off by 0.2 or more.
- A linear calibration fitted on the other cells cuts it to 0.014 (RMSE 0.12). Still above the
  real-trial variance, so the real trials beat the calibrated simulator alone.
- Break-even: about **10 real trials** (bootstrap interval 5 to 26). With fewer real trials
  than that, the calibrated simulator is the better predictor of a new policy's success; with
  more, the real trials are.
- The rank correlation is r = 0.90. High rank agreement and a usable level estimate are
  different things.

**Caveats.** Only policy-level rates are published, so this cannot test the stronger idea
of pairing individual episodes. The simulator rates are treated as noise-free. The
intervals are optimistic because cells share policies and tasks. The paper's text says 24
eggplant trials, but its real rates are multiples of 1/30, so we used 30.

The code, data transcription and pre-registered hypotheses are in
[`research/sim2real-inference`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/sim2real-inference)
(milestone 4 of an open programme on certifying robot policies with a biased simulator).
