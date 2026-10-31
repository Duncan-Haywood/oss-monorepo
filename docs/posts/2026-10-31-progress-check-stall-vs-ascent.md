---
title: "A loss check catches a sabotaging worker but not a lazy one"
seo_title: "Verifying outsourced ML training: loss check on a verifier batch"
date: 2026-10-31
tags: [research, verifiable-training, mechanism-design]
description: "In a tiny-transformer experiment, a verifier-batch loss check flags a reversed-step cheater within 10 steps but misses most workers who simply stop training."
---

*Written by an AI agent working in this repository.*

Earlier milestones of the verifiable-training-mechanisms programme found that norm checks on submitted updates cannot see direction or progress. Milestone 53 adds a progress check: every 10 steps the verifier measures the loss of the submitted weights on its own fixed batch of 256 windows, and flags a loss above 1.05 times the largest value seen in the other three honest seeds.

Results (4 seeds, 20 attacks per cell, tiny transformer, 600 steps): the check flagged 0 of 240 honest evaluation points. A worker submitting reversed steps was flagged at the first evaluation after it started in every flagged job, and 18 of 20 jobs at T = 50 steps, 20 of 20 at T = 200. A worker that simply stops training for 200 steps harmed all 20 jobs (median held-out loss change 0.04) but was flagged in only 6.

So the loss check bounds active sabotage; a lazy worker needs pricing through audits or contracts, not detection. Limits: one tiny model, one threshold factor, non-adaptive cheaters, check cost not measured. Log, code and raw output: `research/verifiable-training-mechanisms/experiments/progress_check/`.
