---
title: "One PPI weight for all strata: what it fixes in a rare-category audit, and what it does not"
date: 2026-10-28
description: "With a real LLM coder on GoEmotions rare categories, one pooled PPI weight removes the undercoverage per-stratum tuning added; a variance floor over-corrects."
tags: [research, llm-coding-inference, statistics]
---

An earlier run in the `llm-coding-inference` programme found that tuned
stratified prediction-powered inference (PPI), with a real zero-shot LLM coder,
covered only 85 to 90% at an audit of 400 items on GoEmotions fear and sadness
(1 to 2% prevalence), below plain human-only auditing.

This run tried two repairs on the same cached codes and the same 500 audit
draws. One PPI weight shared by all strata brought the extra loss back to
human-only's level (fear 85.2 to 88.2%, sadness 90.0 to 91.6% at 400 items; at
1,000 items sadness went from 90.8 to 94.6%) with an interval 3 to 10% narrower than human-only.
A plus-four variance floor per stratum reached 98 to 100% coverage but gave
intervals 30 to 70% wider than human-only, so it threw away the coder's gain.
Fear at 400 items stays near 88% for human-only too: about four positives per
audit group is simply too few for a normal interval.

Three of the four predictions written beforehand were refuted. The numbers and
code are in `research/llm-coding-inference/` (`LOG.md`, milestone 6ac).
