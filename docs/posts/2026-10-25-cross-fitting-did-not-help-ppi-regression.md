---
title: "Cross-fitting the PPI++ weight bought nothing at 400 audited items"
date: 2026-10-25
description: "A null result: choosing the prediction-powered weight on the other half of the audit gave the same coverage as tuning it in-sample, and was 1 to 3% wider."
tags: [research, llm-coding-inference, statistics]
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks
how much human checking AI-coded text needs before a regression on it can be
trusted. The previous step tuned the prediction-powered weight (PPI++) on the
same 400 hand-coded tweets it then used for the estimate, and saw coverage dip
by up to a point. The obvious worry was selection: tuning and estimating on the
same rows.

This step cross-fits instead: each half of the audit gets its weight from the
other half. On the NaijaSenti corpus (four languages, three stand-in coders,
1,000 audits per cell), coverage was 94.4 to 95.9% in all 15 coefficient-by-coder
cells, the same mean (95.15%) as in-sample tuning in a fresh replicate. The
earlier one-point dip did not reproduce, so it was noise. Cross-fitting was 1 to
3% wider than in-sample tuning, giving back part of the 1 to 7% gain the better
coder showed.

So at this audit size the simple version is fine, and the result is a null that
closes off a branch. Caveats: one corpus, stand-in coders (no real LLM yet), and
differences this small are below what 1,000 draws can resolve. Log, code and
tables: `research/llm-coding-inference/LOG.md`, milestone 6i.
