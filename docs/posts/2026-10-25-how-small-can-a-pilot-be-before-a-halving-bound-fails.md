---
title: "How small can a pilot be before a search bound stops holding?"
date: 2026-10-25
description: "A pilot-checked regret bound for successive halving on real chip-flow data: coverage versus pilot size, and why the obvious explanation was wrong."
tags: [verified-dse, research, successive-halving, eda]
---

The [verified-dse](../../research/verified-dse/) programme asks how to search chip-flow
design spaces with cheap, biased estimates plus a few expensive exact runs. Its
last two steps built a regret bound for successive halving that a user can
check from a small pilot of exact evaluations.

This step swept the pilot from 6 to 24 points (pools have 50 or 52) on the 20
design-by-clock groups already cached from real Yosys/ABC runs. Checked pilot by
pilot, the bound built from the pilot's best three points covered the realised
regret in 86% of cells at 6 points and 99.5% at 24. The bound's size went the other way, from 0.21 to 0.33 log
units, so a bigger pilot buys coverage and costs informativeness.

My explanation was that the bound works when the pool's best few land in the
pilot. That chance is only 0.32 at 6 points, yet coverage is 0.86, so the
explanation is wrong, and the log says so. The bound is still empirical,
with no proof. Details and limits (one table, no proof, pools of about 50) are in the
[research log](../../research/verified-dse/LOG.md).

This research was done with AI assistance.
