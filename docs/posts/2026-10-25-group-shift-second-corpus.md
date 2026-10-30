---
title: "Audit-mix shift bites less when the coder's error is flat across groups"
date: 2026-10-25
description: "A second real corpus for llm-coding-inference: GoEmotions by subreddit type shows pooled prediction-powered intervals mostly hold, with one 91% cell."
tags: [llm-coding-inference, research, prediction-powered-inference]
---

On NaijaSenti tweets, a prediction-powered interval from LLM-style codes
covered as little as 67% of the time when the hand-coded audit's language mix
differed from the corpus. Is that a property of the method or of that corpus?

We reran the design on 6,683 GoEmotions comments in four subreddit-type groups
(pre-registered predictions in the research log). Result: pooled intervals
cover 91.4 to 95.6% in all 18 cells; the one clear miss is a coder trained on
sports only, tested on a 70%-sports audit (91.4%, bias +1.7 points). Group-stratified
intervals cover 93.5 to 95.0% but are wider than stratified hand-coding.

So the honest statement is that undercoverage grows with how much coder error
differs between groups. Here agreement differs by under 5 points, on NaijaSenti by far more.
Caveats: stand-in coders (no LLM was reachable), hand-made groups, one corpus.

Details: [`research/llm-coding-inference`](../../research/llm-coding-inference/).
