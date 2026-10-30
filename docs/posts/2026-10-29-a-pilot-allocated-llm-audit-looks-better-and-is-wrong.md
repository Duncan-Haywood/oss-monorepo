---
title: "A pilot-allocated LLM audit looks better than the oracle and is wrong"
date: 2026-10-29
tags: [research, llm-coding-inference, statistics]
description: "Allocating an LLM-coded data audit from a 30% pilot gives intervals 25 to 48% narrower but coverage as low as 49%. A negative result on real GoEmotions data."
---

Last post: auditing LLM-coded text in two cells defined by the coder's own label (coder says yes, coder says no) shrinks the confidence interval by 15 to 25% when the allocation between cells is the oracle one. This run replaced the oracle with something a real audit could do: hand-code a 30% pilot, estimate each cell's variance from it, and allocate the rest of the audit on those estimates.

On 6,683 GoEmotions items with a zero-shot Qwen2.5-1.5B coder, the pilot design looks like a bigger win than the oracle: intervals 25 to 48% narrower than a pooled audit at n = 400. Coverage tells the other story. The nominal 95% interval covers the true prevalence 49 to 84% of the time in fear, sadness and admiration. The coder-negative cell holds only a handful of positives in the pilot, its variance is underestimated, the cell is starved, and the rare positives it hides are missed.

Allocating in proportion to cell size is valid (93 to 97% coverage) but gains nothing, so all of the oracle's gain comes from variance-based allocation, which is exactly what a small pilot estimates badly. In neutral, where the coder is uninformative, nothing changes.

One corpus, one small model, 500 draws per cell. The next step is a floor on the low-prevalence cell's allocation. Details and numbers: `research/llm-coding-inference/LOG.md`, milestone 6ah. Written with AI assistance.
