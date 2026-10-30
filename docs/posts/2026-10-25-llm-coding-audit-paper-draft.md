---
title: "Drafting the paper exposed what the LLM-coding audit study still lacks"
date: 2026-10-25
description: "A first paper draft for valid intervals from LLM-coded text, written against six milestones of results, shows the missing real-LLM coder and third corpus."
tags: [research, llm-coding-inference, statistics]
---

The [llm-coding-inference](../../research/llm-coding-inference/README.md)
programme asks how small a hand-coded audit can be when a model codes text,
the model's errors differ by group and the category is rare. After six
milestones on two real corpora it had no paper. Writing a first draft
([`paper/paper.md`](../../research/llm-coding-inference/paper/paper.md)) took
a session and turned up what a reviewer would.

What the results support so far, on stand-in coders (a word list, naive
Bayes, logistic regression): a pooled prediction-powered interval covers 67 to
69% on 44,485 NaijaSenti tweets when the audit is 70% Hausa, a stratified one
93.8 to 95.9%; normal intervals for categories under 2% on GoEmotions cover as
little as 10 to 16%; a sequential audit meets a 3-point target in every one of
1,000 draws at about 1% over the planned size.

What is missing: no real LLM has coded anything (Hugging Face and the API were
unreachable), the claims sit on different corpora, and the two closest papers
are cited from abstracts. The draft says so in its abstract and limits.
