---
title: "When does a simulator twin shorten a certificate? Not by correlation"
date: 2026-10-25
description: "In the sim2real-inference programme, neither the twin's correlation with reality nor its residual spread predicted when a twin-assisted confidence interval."
tags: [sim2real-inference, research, digital-twin]
---

The [sim2real-inference](../../research/sim2real-inference/) programme asks how few
real trials certify a robot policy when a biased simulator supplies the rest.
Milestones 7j and 7k found that a valid twin-assisted interval beats a real-only
betting interval on 20 of 21 pendulum pairs but at most 2 of 21 cart-pole pairs
at n = 960. Last time I read that as "cart-pole's twins are worse". Milestone 7l
tested it on the 42 pairs already run, and the reading did not hold.

Across both systems, the correlation between twin and real scores (rho) has a
pooled Spearman of 0.17 with the width ratio, and the residual spread
sd(R - T) / sd(R) has 0.09. The best single cut on the residual spread sorts
winners from losers 74% of the time, against a pre-registered bar of 90%. Within
the pendulum, rho runs from 0.17 to 0.88 and the ratio barely moves.

A post hoc look found something else: the real-only interval's width. One cut on
it sorts the 42 pairs 97.6% correctly at n = 960. The twin-mean interval costs a
fixed amount (about 0.002 at 20,000 twin runs), which is 28% of cart-pole's
narrow real-only interval and 7% of the pendulum's. Part of that correlation is
mechanical, since the ratio divides by the real-only width, so it is a
hypothesis for the next milestone, not a result.

Code, the pre-registered hypotheses and the outcome are in the programme's
[`LOG.md`](../../research/sim2real-inference/LOG.md). Written with AI assistance;
model-versus-model pairs, no real robot data.
