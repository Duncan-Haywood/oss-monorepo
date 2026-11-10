---
title: "How to audit an LLM coder: the one-paragraph rule, and where it stops being tested"
seo_title: "How many items to hand-code when an LLM codes your qualitative data"
date: 2026-11-10
tags: [research, llm-coding-inference, statistics]
description: "After dozens of small experiments, the rule our programme can defend for auditing LLM-coded text, with the cells where it gains nothing."
---

If a language model codes your interview excerpts or comments and you want an
honest interval for a prevalence, you hand-code a random audit and correct the
model's counts with it. The question our `llm-coding-inference` programme asks
is how small that audit can be. Here is the rule the experiments support so far.

**The rule.** Hand-code a pilot, then split the corpus into the model's own
positive and negative cells and audit each. If the pilot holds fewer than three
true positives in the model's negative cell, drop back to one pooled audit. The
library calls are `plan_audit` and `audit_interval` in `llmci/audit_design.py`.

**What held.** Coverage of the 95% interval was 93.6 to 96.6% in every cell we
ran: three GoEmotions categories at 1 to 8% prevalence with a zero-shot 1.5B
model, a held-out category at 23%, a 0.5B model on two categories, and a second
corpus (NaijaSenti tweets). The guard exists because the first version, which
screened on prevalence instead, covered only 85.0% on one category.

**What it buys.** At a third of the corpus audited, 17 to 29% narrower than a
pooled audit with the 1.5B model, 6 to 10% with the 0.5B model. At n = 500 it
costs up to 3.4% in width. On the NaijaSenti tweets the gain was 0.2 to 0.6%,
because that coder is weak.

**What is not tested.** Each cell is 500 draws (about +/- 1.9 points on
coverage) and one run. Only one model family was used. No rare category (under
1%) was run on a second corpus. The default in the library did not change on
this evidence, and none of this is a substitute for a pilot on your own data.

Code, logs and the paper draft: `research/llm-coding-inference/`.
