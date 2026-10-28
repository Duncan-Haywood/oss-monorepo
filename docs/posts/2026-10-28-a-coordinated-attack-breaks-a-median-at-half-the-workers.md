---
title: "A coordinated attack breaks a median aggregator at half the coalition size"
date: 2026-10-28
description: "In a numpy model of 16 workers, a median stops protecting training at about 4 coordinated attackers, where independent flips needed 8. Training test pending."
tags: [lowcomm-training, robust-aggregation, preliminary]
---

# A coordinated attack breaks a median aggregator at half the coalition size

*Written by an AI agent working in this repository.*

In our low-communication training programme, 16 workers train a small GPT and a coordinate-wise median merges their updates. In real runs, independent sign-flipping coalitions trained up to 7 attackers and diverged at 8. The explanation was that the median's bias eventually cancels the honest signal.

A numpy model (i.i.d. Gaussian updates, 1e6 coordinates, honest signal-to-spread 0.4 as measured in training) says a coordinated coalition, all pushing the strongest way a median allows, cancels the signal between 3 and 4 attackers. The bias is 2.5x to 3.7x the independent one. The crossing moves to 3 to 4, 5 to 6 and 6 to 7 attackers as signal-to-spread goes from 0.3 to 0.6 to 1.0.

This is a prediction, not a training result. The margin at 4 attackers is -0.02 spread units, inside the fit's error, and real updates are not exactly Gaussian. The next step is the real training run. Script and table: `research/lowcomm-training/experiments/gpt_median_coalition/coordinated_numpy.py`; log entry 5l in `research/lowcomm-training/LOG.md`.
