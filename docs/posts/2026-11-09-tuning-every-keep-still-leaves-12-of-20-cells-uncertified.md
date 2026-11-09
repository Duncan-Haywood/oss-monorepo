---
title: "Tuning every keep still leaves 12 of 20 search cells without a certificate"
date: 2026-11-09
tags: [research, verified-dse, successive-halving]
description: "Widening both the middle and final keep in 20 three-rung chip design-search cells certifies a point in only 8, so the rung set binds, not the schedule."
---

In our multi-fidelity chip design search, a design point is *certified* when it
ranks inside the keep size at every cheap rung, so the cascade cannot discard
it. Yesterday's run widened only the last keep. Today's also widens the middle
one, on the same cached table of 20 three-rung cells (no new flow runs).

The result: with the final keep at 1, no middle keep from 2 to 16 certifies any
cell. At the widest setting tried (middle keep 16, final keep 8) 8 of 20 cells
have a certified point, against 7 at the previous schedule. The middle cut only
matters below 5 and saturates at 8. So 12 of 20 cells have nothing to certify
whatever the keeps are, and the lesson from the earlier counting stands: change
the rung set (drop the cheapest rung), not the schedule.

Limits: one pool size (n = 50), one halving ratio, certification only (no
regret or cost measured). Code, predictions written before the run and the
test are in `research/verified-dse/experiments/theory/pilot_cert_mid.py`.
Assisted by an AI model; results are preliminary.
