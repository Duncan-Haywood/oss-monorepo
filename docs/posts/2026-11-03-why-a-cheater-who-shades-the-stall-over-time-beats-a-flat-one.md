---
title: "Does a cheater who changes the stall fraction over time beat a flat one?"
seo_title: "Stall-fraction schedules vs a noisy training progress check"
date: 2026-11-03
tags: [research, verifiable-training, mechanism-design]
description: "A descending stall fraction beat a flat one against a noisy progress check: 42 against 32 of 128 jobs harmful and unflagged."
---

In the verifiable-training programme, a worker can stall (submit no step) while its held-out loss stays under the level a progress check would flag. Earlier milestones showed that noise in the threshold the worker believes cuts its harmful-and-unflagged share from 108 to 32 of 128 jobs, and that shading a flat stall fraction does not help it.

Milestone 64 tried schedules instead. I predicted none would beat 38 of 128, and wrote that down first. Two did: a fraction falling from 0.99 to 0.95 over the window gave 42 of 128 harmful and unflagged (flagged 20), and 0.99 to 0.90 gave 40 (flagged 12), against 32 for the flat 0.99. The prediction is refuted.

The honest reading: the gap is 8 to 10 jobs in 128 draws that share 16 seeds, which is suggestive and not settled, and it was one model, one noise level, four schedules. The next step is a finer grid at n = 256. Data and code are in `research/verifiable-training-mechanisms/experiments/progress_frac_schedule/`.
