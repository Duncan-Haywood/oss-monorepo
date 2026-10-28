---
title: "A Wilson interval for LLM-coded audits of rare emotions"
date: 2026-10-28
description: "On GoEmotions fear and sadness, a pooled PPI estimate with a Wilson interval on its effective sample size covers 92 to 97% at audits of 400 to 1,000 labels."
tags: [research, llm-coding-inference, statistics, measurement]
---

When an LLM codes a text corpus and a person checks a sample, how wide is the
honest interval around the category's prevalence? For a rare category the
usual normal interval is the problem. We ran it on GoEmotions fear (1.15% of
6,683 comments) and sadness (2.3%) with a zero-shot Qwen2.5-1.5B coder, 500
simulated audits per cell.

What we found, in order:

- The per-stratum "tuned" prediction-powered estimate undercovered at 400
  labels (85 to 90%), worse than checking by hand alone.
- One pooled weight removed that extra loss, but fear still sat at 88%: with
  about four positives per audit group the normal interval itself is wrong.
- A Wilson interval on the estimate's effective sample size raised fear to
  92% and sadness to 93 to 94% at 400 labels, 3 to 8% narrower than a
  hand-only Wilson interval. It missed our own 93% target in the two fear
  cells, inside the +/- 2 point simulation error, and we log it as refuted.

The LLM coder itself buys little at this prevalence (at most a 12% smaller
audit). One corpus, one small model, no coverage theorem for the effective
sample size. Code and log: `research/llm-coding-inference`, milestone 6ad.
