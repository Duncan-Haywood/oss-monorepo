---
title: "How many coordinated attackers can a median aggregator absorb? Seven of sixteen, at a price"
date: 2026-10-28
description: "In simulated 16-worker low-communication training, a median aggregator keeps training with 4 to 7 colluding attackers, at +0.23 to +0.77 nats."
tags: [research, lowcomm-training, robust-aggregation, diloco]
---

In the `lowcomm-training` programme we train a small character-level GPT with
16 simulated DiLoCo workers and aggregate their updates with a coordinate-wise
median. The worst attack a median allows is for k workers to all send the same
huge value against the honest mean's sign.

On two seeds, the final validation loss rises over the clean median by about
+0.23 nats at k = 4, +0.36 at k = 5 and +0.53 at k = 6 (the seeds differ by at
most 0.025). One seed at k = 7 gives +0.77, and training still converges. The
cost per extra attacker grows (+0.135, +0.175, +0.225 nats), as expected when
k approaches 8, where the median becomes an attacker value. We did not run
k = 8.

An earlier numpy "net signal" account predicted a collapse near k = 4; it was
wrong about that, and the log says so. Everything is one small model and one
corpus: see `research/lowcomm-training/LOG.md`, milestone 5m.
