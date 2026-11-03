---
title: "BOHB beats random routing for chip search only at small budgets"
seo_title: "BOHB versus random routing for chip design-space search"
date: 2026-11-03
tags: [verified-dse, research, chip-design, bayesian-optimisation]
description: "A paired test over 40 design and clock cells: BOHB wins at 15 routed-run equivalents, and loses to random routing at 40 even with a faithful cheap rung."
---

In the `verified-dse` programme, BOHB (Hyperband brackets with KDE-proposed entrants) searches a chip pass-sequence space using a cheap early-routing rung (R2) to decide what to route fully. Replaying cached flow results, it beats random routing at a budget of 15 routed-run equivalents by 0.94 points of regret (paired bootstrap over 40 design-clock cells, [-1.72, -0.19]).

Corrupt R2 with synthetic noise and the win survives either the score or the features being noisy at sigma 1 (-0.83 and -0.63 points), and disappears only when both are (-0.16 [-0.76, +0.45]). The part a practitioner should take away is the other row: at 40 equivalents BOHB is worse than random in every arm, including the faithful one (+1.01 [+0.22, +2.06]). It is a low-budget tool.

Limits: the 40 cells share designs, so the intervals are descriptive; the noise is iid and synthetic; I did not write predictions before this run. Structured unfaithfulness needs OpenROAD, which cloud sessions lack. Numbers and files: `research/verified-dse/LOG.md`, milestone 67.
