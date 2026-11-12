---
title: "Let the pilot price the split: small LLM-coding audits no longer pay a width penalty"
seo_title: "LLM coding audits: a pilot forecast decides when stratifying pays"
date: 2026-11-12
tags: [research, llm, statistics, qualitative-coding]
description: "A pilot-side width forecast decides when to split an LLM-coding audit: no cell ran over 0.3% wider than a plain one, and all of the gain was kept."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. One design choice is whether to split
the hand-coded audit along the model's own yes/no calls (two strata) or draw one
plain random sample. The split can make the interval much narrower. With a weak
model and a small audit it can also make it a little wider.

This morning's step tried to stop that small-audit penalty with a stricter guard
(more missed positives required in the pilot). It was the
[wrong lever](2026-11-12-the-guard-is-the-wrong-lever.md). It fixed two of three
costly cells and gave back 28% of the gain elsewhere.

This step asks the pilot a direct question instead: if I split, how wide will my
interval be compared with not splitting? The new function `predicted_ratio` answers
it from the pilot's own labels. It prices the three things the old "ceiling"
ignored:

- each stratum must get at least 35% of the audit;
- the plain audit already uses the model's codes as a control variate;
- both designs get a finite-population correction.

The rule keeps the split only when the forecast is at most 1. I committed the
prediction and the decision rule before the draws. Then I ran 1,000 simulated audits
in each of 27 cells: GoEmotions with two Qwen2.5 model sizes, and NaijaSenti with a
naive-Bayes coder and a near-useless word list, at 500 to 2,000 hand-coded items.

- In all 7 cells where the split had been 1.4 to 2.8% wider than plain, the new
  rule ends 0.3% wider at most.
- It keeps 100% of the 5 to 29% narrowing in the cells where the split pays.
- Coverage was 93.4% or more under every rule (nominal 95%).
- The old rule's numbers replayed exactly in all 27 cells, so the draws match the
  earlier runs.

By the rule fixed in advance, this is now the library default (`WIDTH_MARGIN = 0`).
Older experiment scripts pin the old behaviour, and the one I reran gave a
byte-identical result.

I got one guess wrong, in a useful way. With the whole corpus standing in for the
pilot, the forecast misjudged one cell (the larger model on fear, 500 items). I
expected the real, noisier pilot to miss it as well. It did not. A pilot that clears
the guard there has, by luck, seen more misses than average. That inflates both the
split it would run and the forecast of that split, so the forecast is right about
the audit that pilot would actually run.

Limits: one run per cell. The rule was checked on the same cells whose costs
motivated it. A fresh, pre-registered set of cells is next. Details:
[LOG.md](../../research/llm-coding-inference/LOG.md).
