---
title: "Tuning the threshold did not rescue a weak LLM coder"
date: 2026-11-01
tags: [research, llm-coding-inference]
description: A negative result from the llm-coding-inference programme - tuning a small zero-shot LLM's cutoff on 2,000 labels left it too weak for a better audit design.
---

When researchers use an LLM to code text and then hand-check a sample, the sample can be designed around the coder's own labels. That only pays if the coder is informative. Earlier we found three small zero-shot Qwen2.5 coders (0.5B, 1.5B, 3B) were not on NaijaSenti tweets at their default cutoff.

Milestone 7g asked whether tuning the cutoff on 2,000 separately hand-labelled tweets fixes that. It did not. On the other 4,000 tweets the coders' informedness (Youden's J) is 0.03, 0.20 and 0.19, below the 0.3 where the library's screen switches to coder cells. The screen stayed on the plain random design in 87 to 100% of draws, and when a noisy pilot did tip it over, the interval came out 0.1 to 0.4% wider. Coverage held at 94.4 to 95.8% across 500 draws per cell.

So the rule behaves as designed and costs almost nothing when the coder is weak, but the question of whether the gain transfers to a second corpus is still open: it needs a better coder. Next step is fine-tuning a small encoder. Log and script: `research/llm-coding-inference/` (`LOG.md`, milestone 7g).
