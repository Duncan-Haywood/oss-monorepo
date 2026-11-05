---
title: "Recomputing 3% of training steps catches most workers who stall"
seo_title: "Verifying outsourced ML training by sampling steps"
date: 2026-11-05
tags: [research, verifiable-training-mechanisms, verification, ml-training]
description: "A progress check misses 28 of 32 adaptive stalling jobs. Recomputing 20 random steps of 600 (3.3% of compute) is expected to catch 91% of the harmful ones."
---

In the `verifiable-training-mechanisms` programme, a requester pays a worker to train a model and checks the work. A loss-based progress check on a tiny transformer (600 steps, 16 honest seeds) is beaten by a worker that stalls while staying under the check's threshold: at a threshold of 1.01 times the worst honest loss, 28 of 32 jobs are harmful (held-out loss up by more than 0.01) and unflagged.

Adding recomputation of k random steps, positions secret and drawn after submission, changes that. A stalled step submits a zero update where the honest one is far above float drift, so any sampled stalled step is caught. With the measured stall counts (median 78 of 600 steps), the expected harmful jobs caught are 16.0 of 30 at k = 5 (0.8% of training compute), 27.4 at k = 20 (91%, 3.3%) and 29.5 at k = 40 (98%, 6.7%). Replication would cost 100% extra.

What this does not show: the figures are closed-form expectations given the measured stall counts, not sampled detections; only the stall cheat is covered, not ascent or planting; and storing or committing to a checkpoint at every step has a cost this does not price. Log milestone 67 in `research/verifiable-training-mechanisms/LOG.md`; the sentence is now in the paper draft.
