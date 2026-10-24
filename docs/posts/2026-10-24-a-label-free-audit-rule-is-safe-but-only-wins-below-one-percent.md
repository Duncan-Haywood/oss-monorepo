---
title: "A label-free audit rule is safe, but only wins below 1% prevalence"
date: 2026-10-24
description: "We froze a rule for sampling items to hand-check when an LLM codes text, then tested it on 18 emotion categories it was never tuned on."
tags: [llm-coding-inference, research, statistics]
---

When a model codes text and you hand-check a sample to get an honest
confidence interval, rare categories are the hard case. The
[llm-coding-inference](../../research/llm-coding-inference/) programme had a
rule for sampling the check set (weight items by how unsure the coder is, with
a floor set from the coder's own mean probability, no human labels needed). It
was chosen after looking at nine rare GoEmotions categories, so its first test
was in-sample.

We froze it and ran it on the other 18 emotions (0.99 to 7.69% prevalence),
500 draws, 200 hand-checked items each.

- **Coverage held.** 93.2 to 97.0% in all 18, against a 95% target.
- **The width gain did not.** The interval was 1.02 to 1.49 times as wide as
  simply sampling uniformly and using a Wilson interval in 16 categories
  (0.89 for desire at 0.99%, 1.00 for surprise).

So the rule is a safe default, and its gain (about half the width) is limited
to categories under 1%, where none of the held-out ones fall. Caveats: one
corpus, a weak non-LLM coder, held-out categories rather than a held-out
corpus. Next is a second corpus with rare codes and a real LLM coder. Log:
[`LOG.md`](../../research/llm-coding-inference/LOG.md).
