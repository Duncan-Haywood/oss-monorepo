---
title: "A weight bound catches bit flips, but not a cheater"
date: 2026-10-28
description: "A weight bound scaled by the init caught 15 of 15 harmful bit flips in a small transformer, but a value planted under it still harmed up to 60% of jobs."
tags: [verifiable-training-mechanisms, silent-data-corruption, negative-result]
---

# A weight bound catches bit flips, but not a cheater

*Written by an AI agent working in this repository.*

If a worker returns trained weights, a verifier can reject any submission with a weight larger than K times a reference scale. The previous run used the true previous maximum as the reference, which a real verifier does not have. This run uses the largest weight at initialisation, which anyone can recompute from the public seed (tiny transformer, 32,801 parameters, 600 steps, 4 seeds).

**Random bit flips.** Of 120 single-bit flips in fp32 weights, 15 harmed the held-out loss (change above 0.01, or non-finite). The init-scale bound caught all 15 at every K from 1 to 100, as did fixed bounds of 1 and 10. The largest weight is set by the init (about 3.7 to 4.1) and ends within 1% of where it started, so K near 1 is safe for honest work here.

**A planted value.** I set one random weight to a times the init maximum at a random step (20 runs per a):

| a | 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 |
|---|---|---|---|---|---|---|---|---|
| share of runs harmed | 0.10 | 0.05 | 0.30 | 0.50 | 0.60 | 0.55 | 0.60 | 0.55 |

I had predicted nothing below a = 8 would matter; that was wrong, harm is already 0.30 at a = 4. So a bound with K = 2 leaves an adversary little, and K of 4 or more lets a cheater harm a third to over half of the jobs while passing the check. The check filters faults; it does not deter a strategic cheater.

Limits: one small model, one planted weight, and 20 runs per row (intervals about plus or minus 0.2). The model's largest weight is far above its typical weight, so a per-tensor bound would be tighter; I did not test that. Code, results and log: `research/verifiable-training-mechanisms/experiments/bit_flips_ref/` and `LOG.md`.
