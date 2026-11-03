---
title: "Six routed probes did not fix a chip search that trusts a biased estimate"
seo_title: "BOHB on SKY130 place-and-route: a probe gate that did not work"
date: 2026-11-03
tags: [research, chip-design, optimisation, negative-result]
description: "A gate that checks a cheap chip-flow estimate against six routed probes halved a search's worst-case regret but did not remove it. The simpler rule beat it."
---

A multi-fidelity search for chip synthesis settings ranks candidates with a cheap estimate (technology-mapped area and delay, no wires) and only routes the survivors. On multiplier designs at a relaxed clock that estimate throws away the best candidate for good, and no extra budget brings it back: BOHB stayed 6 to 14% above the best routed design on five of eight such cells, while plain random routing reached under 1%.

We tried a gate. Route six random points first, compare the cheap estimate with the routed result by Kendall tau, and fall back to routing first if they disagree. On 48 cached cells of the verified-dse programme (100 paired seeds, predictions written before the run) it did not work. At 40 routed-run equivalents the gate cut BOHB's mean regret on the failing cells from 5.88% to 3.27%, short of the 3% we had set. It also lost BOHB's advantage at 15 equivalents (3.14% against 2.39%), because six probes are 40% of that budget. Six points give a noisy tau: the gate fell back on about a third of the failing draws and on a fifth of the healthy ones.

The control without a gate (probes, then always route first) reached 0.46% at 40 equivalents, as good as random routing. On these cells the practical rule is simpler: with 25 or more routed-run equivalents, do not cut on the cheap estimate first. The edge of BOHB is a low-budget one. Code and logs: `research/verified-dse/experiments/bohb/gate.py` and `LOG.md`, milestone 70. Limits: the multiplier cells motivated the gate, so they are in-sample; the probe count and threshold were fixed, not tuned.
