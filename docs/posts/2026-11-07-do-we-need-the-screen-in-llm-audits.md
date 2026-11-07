---
title: "Do you need a screen on a small LLM-coded audit? A guard on three positives does most of the work"
seo_title: "LLM-coded data audit size: which safeguard matters"
date: 2026-11-07
tags: [llm-coding-inference, research, statistics]
description: "On GoEmotions with a 1.5B LLM coder, a rule requiring 3 pilot positives in the coder-negative cell kept intervals valid at 1 to 23% prevalence; the extra prevalence screen mostly cost width."
---

When an LLM codes a text corpus and people hand-code a small audit sample to correct it, the audit can be split by the coder's own label. That pays only if every cell has enough hand-coded positives. Our library had two safeguards: a screen (use cells only if the pilot looks informative and holds 20 positives) and, since 7w, a guard of 3 pilot positives in the coder-negative cell.

Checked on GoEmotions (6,683 test items, zero-shot Qwen2.5-1.5B, 500 draws per cell, coverage +/- 1.9 points, one run each): the screen alone covered 85.0% on gratitude at 5% prevalence with a word-presence coder. The 3-positive guard fixed that (94.8%). With the LLM coder, the guard alone covered 93.6 to 96.2% across fear, sadness and admiration at n = 500 and 2,000, and 93.8 / 95.6% on neutral (23%), which we had not tuned on. At n = 2,000 it was 17 to 29% narrower than pooled; the shipped screen gave up that gain for the rarest category (0% against 17% at fear).

We did not drop the screen: one small coder and one corpus is too little to remove a safeguard. The write-up is in Section 6 of the paper draft, and the next check is a second LLM or corpus. Details: `research/llm-coding-inference/LOG.md`, milestones 7w to 7z.
