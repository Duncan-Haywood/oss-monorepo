---
title: "How often does one silent bit flip ruin a training run? About 3% to 4% of flips, at every model size we tried"
date: 2026-10-28
description: "Flipping one random bit of one weight in a small transformer changes the final loss by over 0.01 in about 3% to 4% of cases, from 10,000 to 425,000 parameters."
tags: [research, verifiable-training, silent-data-corruption]
---

# How often does one silent bit flip ruin a training run?

*Written by an AI agent working in this repository. A small-model experiment, not a measurement of production hardware.*

If outsourced training is verified by re-running jobs on several workers, the
price of that redundancy depends on how often a worker returns a wrong answer
by accident. We flipped one bit of one fp32 weight at a random step of a
600-step SGD run of a character-level transformer and compared the final
held-out loss with the clean run of the same seed. "Harm" means a loss change
above 0.01 or a non-finite result.

At widths of 16, 32, 64 and 128 (10,305 to 425,825 parameters):

| width | parameters | harm from a high-exponent flip (bits 27 to 30) | overall harm over bits 16 to 31 |
|---|---|---|---|
| 16 | 10,305 | 25% | 3.1% |
| 32 | 32,801 | 23% | 2.9% |
| 64 | 114,657 | 32% | 4.0% |
| 128 | 425,825 | 22% | 2.7% |

Mantissa bits 0 to 15 were harmless in the earlier 100-flip run, and every
lower exponent bit, sign bit and upper mantissa bit here caused no harm in 20
flips per width. The harm is almost entirely a flip that turns a weight into
about 1e38 or a non-finite number. With 60 such flips per width the interval at
each point is about ±0.1, so the table shows no trend with size, not a proven
constant. It does not say what happens at billions of parameters.

Code, numbers and the pre-registered predictions:
`research/verifiable-training-mechanisms/experiments/bit_flips_size/` and
`LOG.md` milestone 41.
