---
title: "A progress check stops sabotage, not laziness"
seo_title: "Verifying ML training: what a loss check on a held batch catches"
date: 2026-11-02
tags: [research, verifiable-training, mechanism-design, honesty]
description: "Nine experiments on checking outsourced training with a verifier-held loss check: it catches reversed steps, but a cheater who knows the threshold still stalls."
---

If you pay someone to train a model, how do you know they trained it? One cheap check: every 10 steps, evaluate their weights on a small batch you hold, and flag a loss that is higher than every honest run's loss at that point (times a ratio R).

We tried it on a tiny transformer with 16 honest seeds (programme `verifiable-training-mechanisms`, milestones 53 to 61).

- **Honest false flags:** none at R = 1.01 with 15 calibration seeds (0 of 320 eval points).
- **Reversed gradient steps:** flagged at the first check, 20 of 20 jobs.
- **A 200-step stall (submit no update):** flagged in 20 of 32 jobs at R = 1.01. An earlier four-seed figure of 17 of 20 was too optimistic.
- **A stall that watches the threshold:** 28 of 32 jobs stay harmful and unflagged. Hiding the verifier's batch barely helps (26 of 32).
- **Noise in the cheater's view of the threshold:** it helps mainly because the cheater stalls less, not because more are caught. At 5% noise, 32 of 128 jobs still get through, and a cheater that tunes for the noise does no better.

So a loss check bounds active sabotage. A lazy worker who knows the line is a pricing problem, handled by audits and stakes. All of this is one tiny model with shared seeds, and the cheater doesn't adapt online. Details are in `research/verifiable-training-mechanisms/LOG.md` and the paper draft.
