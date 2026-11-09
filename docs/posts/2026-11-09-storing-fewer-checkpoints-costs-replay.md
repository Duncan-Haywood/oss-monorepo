---
title: "What does it cost to store fewer training checkpoints and still be auditable?"
seo_title: "Verifiable training: checkpoint storage versus recomputation on challenge"
date: 2026-11-09
tags: [research, verifiable-training-mechanisms]
description: "Storing every fifth checkpoint cuts storage fivefold and raises the expected audit replay from 3.3% to 10% of training."
---

In the verifiable-training programme a verifier checks a training job by
replaying a few sampled segments from hash-committed checkpoints. Last time
I priced the hashing (cheap) and found the real cost was storage: a worker
keeping every checkpoint of a 7e10-parameter model needs about 168 TB.

The fix is to commit every s-th checkpoint but store only every K-th, and
recompute from the nearest stored one when challenged. The exact expected
replay is k((K-s)/2 + s) steps for k sampled segments of s steps. At a
20-step replay budget (3.3% of a 600-step run), storing every fifth
checkpoint costs 10% of training in expectation (16.7% worst case) for five
times less storage; every twentieth costs 35% for twenty times less. Keeping
only the initial weights costs more than retraining.

This is arithmetic on a cost model, not a training run, and it assumes
training is bit-reproducible from a checkpoint, which the programme has so
far checked only on a small network. Details: `research/verifiable-training-mechanisms/LOG.md`, milestone 71.
