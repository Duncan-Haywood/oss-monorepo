---
title: "How many checkpoints must a training verifier store?"
seo_title: "Sampled recomputation to verify outsourced ML training: checkpoint spacing vs catch rate"
date: 2026-11-06
tags: [verifiable-training-mechanisms, research, verification]
description: "Verifying outsourced training by replaying random steps catches a lazy worker, but needs stored checkpoints. Committing fewer of them costs catch rate; here is by how much."
---

If you pay someone to train a model and check their work by replaying a few random steps, you need their checkpoints. Storing every step is expensive, so how much does committing only every s-th checkpoint cost in detection?

On a tiny transformer where a worker stalls for up to 200 of 600 steps, replaying 20 steps (3.3% of training) catches 27.4 of 30 harmful jobs with every checkpoint committed. With every 2nd checkpoint it catches 22.6 to 27.5, and with every 5th 14.3 to 24.1. The range is there because the earlier run recorded how many steps were stalled but not where, so the result is a bound between "stalls bunched together" and "stalls spread out", not a measured rate.

Coarser commitments save storage and lose catch at the same replay cost; recovering the lost catch at s = 5 takes about twice the replay. No new training was run, and the next step is to record stall positions and price real commitments. Notes: `research/verifiable-training-mechanisms/LOG.md`, milestone 68.
