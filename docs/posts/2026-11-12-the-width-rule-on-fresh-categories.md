---
title: "The width rule on fresh categories: four new GoEmotions emotions, no penalty, no gain lost"
seo_title: "LLM coding audits: a pre-registered held-out check of the stratify-or-not rule"
date: 2026-11-12
tags: [research, llm, statistics, qualitative-coding]
description: "A pre-registered check on four emotions no rule had seen: the shipped audit rule was at most 0.1% wider than a plain audit in 12 of 12 cells and kept all of the gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. Earlier today the library got a new
default: [let the pilot price the split](2026-11-12-let-the-pilot-price-the-split.md).
A short pilot forecasts whether splitting the audit along the model's yes/no calls
will narrow the interval. If the forecast says no, the audit stays a plain random
sample.

That rule was checked on the 27 cells whose problems led to it. That is a weak
test, so this step ran a fresh one. Before any score existed I picked four
GoEmotions categories by prevalence alone: gratitude (5.1%), curiosity (3.7%),
disapproval (2.8%) and anger (2.3%). None had been used by any earlier step. I
committed the predictions and the decision rule, then had Qwen2.5-1.5B-Instruct
code all 6,683 comments for each category, zero-shot, on a 4-core CPU (about 17
minutes per category). Then I simulated 1,000 audits per cell at 500, 1,000 and
2,000 hand-coded items.

The model turned out good at gratitude (informedness J 0.78), middling at anger
(0.46) and curiosity (0.41), and poor at disapproval (0.14). I had guessed anger
would be poor; it was not.

What happened, against the predictions:

- **The rule was never more than 0.1% wider than a plain audit** (worst 1.001, 12
  of 12 cells). This was the claim under test.
- **The fresh set contained the exact failure the rule was built for.** With the
  poor disapproval coder, the older screen alone ran 3.4%, 4.6% and 1.6% wider than
  plain at the three audit sizes. The forecast brought those to 1.001, 0.998 and
  0.999 by sending most of those audits back to plain sampling.
- **It kept all of the gain where the split pays:** 5 to 39% narrower intervals for
  gratitude, curiosity and anger at 1,000 and 2,000 items.
- Coverage was 93.5% or more under every rule (nominal 95%).

By the rule fixed in advance, the default stays. It has now been checked on 39
cells, 12 of them held out, and no cell is more than 0.3% wider than a plain audit.

One thing I did not predict: the best coder leaves the most on the table in small
audits. For gratitude at 500 items, the corpus-level forecast says the split would
cut the width by a third (0.67). But it is used in only 10% of pilots, and the
realised ratio is 0.98. The model misses so few positives that a 250-item pilot
rarely holds the three misses the safety guard asks for. The guard is the binding
constraint there, not the forecast. Next step: test whether a very good coder can
safely get by with fewer than three pilot misses.

Limits: one model on one corpus for the new cells, one run each, 1,000 draws
(coverage +/- 1.4 points). Script, scores and outputs:
[h7al_heldout.py](../../research/llm-coding-inference/experiments/h7al_heldout.py),
[results](../../research/llm-coding-inference/experiments/h7al_heldout.txt),
[LOG.md](../../research/llm-coding-inference/LOG.md). Written with AI assistance.
