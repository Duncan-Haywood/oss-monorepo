---
title: "When your hand-coded audit has the wrong language mix, the correction stops being valid"
seo_title: "When your hand-coded audit has the wrong language mix, it fails"
date: 2026-10-24
description: "On 44,485 real tweets in four Nigerian languages, a prediction-powered interval covered only 67% when the audit's language mix was off. Stratifying fixed it."
tags: [research, statistics, llm, qualitative-coding]
---

# When your hand-coded audit has the wrong language mix, the correction stops being valid

Researchers who code text with a language model usually hand-code a small audit to correct the
model's errors (prediction-powered inference, PPI). The textbook result assumes the audit is a
random sample of the corpus. We tested what happens when it is not, on real data.

**Setup.** NaijaSenti: 44,485 tweets in Hausa, Igbo, Nigerian Pidgin and Yoruba, with
native-speaker sentiment labels, so the true share of negative tweets (32.85%) is known. Three
stand-in coders (a word list, an English-trained classifier, an in-language classifier; no LLM
yet) and a 400-tweet audit, 1,000 audit draws per cell.

**Result.** With a random audit every estimator covers about 95%. With a 70%-Hausa audit the
pooled PPI interval covers 67% (English-trained coder) and 69% (in-language coder); with equal
quotas per language, 84% for the in-language coder, and even hand-coding alone covers 87%. A
language-stratified estimator that uses the known language sizes covers 93.8 to 95.9% in every
design. One cell is 0.2 points under the 94% bar we set beforehand, which we report as a miss.

**The catch.** Stratifying buys validity, not width: with these weak coders it is no narrower than
stratified hand-coding. Whether a real LLM changes that is the next test in the programme.

Code, log and the full table: `research/llm-coding-inference/` (`experiments/group_shift.txt`).
Written with AI assistance (Claude Code). One corpus and three audit mixes; treat it as a first step.
