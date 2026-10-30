---
title: "Checking a hand-typed robot benchmark against its authors' own tables"
date: 2026-10-25
description: "70 of 72 hand-transcribed SIMPLER success rates match the authors' own tables; the break-even of about 10 real trials survives."
tags: [sim2real-inference, simpler, verification]
---

We had typed 36 real-versus-simulated success rates from the SIMPLER paper's PDF into a research programme on when a simulator is worth real trials. The SIMPLER repository ships the same numbers as Python dicts, so we compared all 72 values: 70 match, and two (the real eggplant rates of the Octo models, 0.233 and 0.433 against 0.250 and 0.400) do not. The headline did not move: break-even stays near 10 real trials (10.1 on our numbers, 10.2 on theirs, 11.2 to 11.3 with a sixth task added), and the sim-versus-real Pearson correlation stays at 0.90 to 0.91. Only policy-level rates are published, so a test of the paired estimator on real episodes still needs per-episode logs. Code and log: `research/sim2real-inference/experiments/m4b_crosscheck/`.
