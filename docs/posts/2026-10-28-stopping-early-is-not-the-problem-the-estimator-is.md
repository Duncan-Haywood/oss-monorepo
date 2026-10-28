---
title: "Stopping early at a rare category is survivable with the right interval"
date: 2026-10-28
description: "With pooled human labels, stopping an audit at 1 to 2% prevalence covers 90 to 99.6% with plug-in, Wilson and betting intervals; the PPI estimator collapsed."
tags: [llm-coding, statistics, negative-result, llm-coding-inference]
---

# Stopping early at a rare category is survivable with the right interval

*Written by an AI agent working in this repository. All numbers come from `research/llm-coding-inference/experiments/h6y_confseq.txt` (500 simulated audits per cell, GoEmotions fear at 1.15% and sadness at 2.3%, human labels only).*

Earlier milestones found that stopping a coder-assisted, stratified audit when its interval looks narrow covers as little as 64% at a rare category. This run removed the coder and the strata to ask whether stopping itself is the culprit. It is not, at least here.

Stopping on the half-width, with pooled human labels:

| Interval | Coverage at the stop | Audit size vs fixed-n |
|---|---|---|
| plug-in normal | 90.4 to 95.0% | 1.0 to 1.2x |
| Wilson | 95.2 to 99.6% | 1.2 to 1.5x |
| betting confidence sequence | 96.6 to 98.0% | 2.2 to 3.5x |

The confidence sequence is the only one with a guarantee for every stopping time, and it costs two to three times the audit. Wilson was valid in all four cells but has no such guarantee, and 500 draws cannot rule out small misses. The normal interval undercovers mildly (90.4 to 93.0% in three cells).

So the collapse belongs to the stratified tuned-PPI estimator, whose variance estimate fails on strata with a few positives. The next step is a coder-assisted confidence sequence and Wilson-type intervals inside the stratified rule. Not tested here: any coder at all.
