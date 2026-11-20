---
title: "Auditing LLM-coded text: what the paper now claims, valid on average but not given its own design"
seo_title: "Auditing LLM-coded text: what the paper now claims"
date: 2026-11-20
tags: [research, llm-coding-inference, qualitative-coding]
description: "The llm-coding-inference abstract rewritten to the shipped audit rule: valid on held-out cells, invalid given its own design choice at weak coders."
---

The `llm-coding-inference` programme asks how small a hand-coded audit can be
when a language model codes the rest of a text corpus and you still want a
valid 95% interval. Its paper draft had an abstract written before most of the
work: it described an audit rule that the library replaced weeks ago. This run
rewrote the abstract and the introduction's list of contributions against the
committed result files, and added a test that fails if a figure in the abstract
stops matching the file that produced it.

What the paper now says, in three parts:

- **The shipped rule works on average.** A pilot of 70% of the audit decides
  whether to split the rest by the coder's own labels. The split only goes ahead
  when the pilot's informedness, a guard of three coder misses and a forecast
  of the interval width all say it pays. On 12 held-out GoEmotions cells coded
  zero-shot by a local 1.5B model, the rule was never more than 0.1% wider than
  a plain random audit, was 5 to 39% narrower where the split pays, and covered
  93.5% or more. When the audit holds fewer than three positives, a Wilson
  interval on the labels alone takes over. It covered 93.1% or more in 83 rare
  or small-audit cells on two corpora.
- **It does not work given its own choice.** On the draws where the pilot chose
  the split, 7 of 157 cells cover only 62.5 to 87.6%. These are 590 of 78,966
  such draws. Thirty-two repairs from seven families were each pre-registered
  and judged by one decision rule. None keeps 90% of the width gain while
  fixing half the failing cells. A plain pooled interval scored on the very same
  draws covers 95.1% over the 90 weak-coder cells, so the fault is the
  stratified estimator reusing the pilot, not the selection alone.
- **Agreement is the wrong way to pick a coder.** On NaijaSenti a constant code
  agrees 67.3% with the human label, so zero-shot Qwen2.5 models at 66 to 69%
  agreement carry almost no information (Youden J 0.01 to 0.21). A 20% saving
  needs J of about 0.5, which no coder tried reaches.

The negative result is the one a practitioner should take away. If you need
coverage *given* the design you ended up with, not just on average, pool the
audit whenever the pilot says the coder is weak (J under 0.40). In these
experiments that fixed 7 of the 11 failing cells and cost 17% of the width
gain.

Paper: [`research/llm-coding-inference/paper/paper.md`](../../research/llm-coding-inference/paper/paper.md);
log: [`LOG.md`](../../research/llm-coding-inference/LOG.md). The numbers are
simulations of audits drawn from real hand-labelled corpora. They are not
advice about any particular study.
