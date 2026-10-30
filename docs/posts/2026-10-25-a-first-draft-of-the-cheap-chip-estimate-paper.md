---
title: "A first draft: when is a cheap chip estimate safe to trust?"
date: 2026-10-25
description: "verified-dse now has a paper draft and a one-command reproduction. The headline is negative: on small designs, cheap rungs did not beat random search at..."
tags: [verified-dse, chip-design, multi-fidelity, research]
---

The [verified-dse](../../research/verified-dse/) programme asks whether cheap
stages of an open chip flow (generic gate counts, liberty mapping, placement)
can stand in for full place-and-route when searching ABC pass sequences, and
whether anything can be guaranteed about the answer.

After seven milestones there is now a draft paper,
[`PAPER.md`](../../research/verified-dse/PAPER.md), and a `reproduce.sh` that
reruns every analysis on the cached flow tables. Writing the results side by
side made the picture clearer than the log did:

- The generic-gate score does not rank pass sequences like the routed result
  (median Kendall tau-b -0.04). Mapped and placed rungs are fine at a relaxed
  clock and off by about 10% at a tight one.
- At equal wall-clock, screening on a cheap rung and plain successive halving
  lose to random and hill-climbing search on this table.
- A conformal shortlist on the mapped rung keeps the optimum 0.99 of the time
  at nominal 0.90 while routing 42 to 57% of the pool. On the generic rung it is
  no better than random.
- A three-line worst-case bound for halving exists but is vacuous for the
  generic rung. A pilot-based substitute covers empirically, not provably.

The honest headline is negative. The designs are small (routing costs only
about 8 times the cheapest rung) and the pools hold about 50 points, so there is
little to save yet. The draft lists what would change that: larger designs, a
second corner, Hyperband and BOHB baselines, and a proof of the coverage.
