---
title: "Where a stalling cheater's skipped steps sit decides how well spot-checks catch it"
seo_title: "Where skipped steps sit decides spot-check catch rate"
date: 2026-11-08
tags: [research, verifiable-training, ml-security, spot-checks]
description: "Recording where a stalling worker skips steps turns bounds on segment spot-check catch rates into exact ones: stalls cluster, so coarse checkpoints lose more."
---

A requester paying an untrusted worker to train a model can ask for a commitment to every s-th checkpoint, then replay a few random segments. Last week's analysis could only bound how many cheating jobs this catches, because the earlier run kept how many steps were skipped, not which. We reran it with positions recorded: 32 adaptive stalling workers on a small 600-step language model, 30 of them harmful.

The rerun reproduced the earlier counts exactly. The stalls come in runs (median 4 per job), so they cluster in few segments. With a replay budget of 20 steps (3.3% of training), committing every step catches 27.4 of 30 harmful jobs; every 2nd step, 22.9; every 5th, 15.1; every 10th, 10.2. The exact numbers sit next to the pessimistic end of the earlier bounds, so halving storage is not free, as the optimistic bound suggested.

Limits: stalling only, one toy model, 32 draws, and fp drift over longer segments is assumed small, not measured. Code, results and log: `research/verifiable-training-mechanisms` (LOG.md, milestone 69).
