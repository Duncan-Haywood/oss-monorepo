---
title: "The new default floor on a second corpus: valid, cheap, and with almost nothing to repair"
seo_title: "LLM coding audits: the default floor on NaijaSenti"
date: 2026-11-17
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 27 fresh NaijaSenti cells with Qwen and naive Bayes coders: the default variance floor keeps 94.4% of the gain and harms no cell."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The shipped audit rule
hand-codes a pilot, and if the model looks informative it splits the rest of the
audit by the model's own label.

Yesterday's milestone 7az (the follow-up to
[7ay](2026-11-16-conditional-floor-good-coders-pay.md)) made a repair the library default. When the pilot shows fewer than
5 coder misses *and* the coder looks weak (J_hat under 0.40), the interval inflates
the variance of the cell the coder calls negative. It was chosen on 130 GoEmotions
cells, all coded by one of two coders. A default chosen that way needs a check on
data it has never seen.

## What was tested

The prediction and decision rule were committed before any draw
([`h7ba_floor_naija.py`](../../research/llm-coding-inference/experiments/h7ba_floor_naija.py)).
The corpus is NaijaSenti: tweets in Hausa, Igbo, Nigerian Pidgin and Yoruba, with
negative sentiment as the category, thinned to 5% or 10% or left at its native 33%.
Three coders: an in-language naive Bayes model (J about 0.40, right at the floor's
ceiling) and two zero-shot local LLMs, Qwen2.5 1.5B (J about 0.21) and 3B (J about
0.06). Audits of 300, 500 and 1,000 items, 27 cells, 1,000 simulated audits each.

## What happened

| | no floor | default floor |
|---|---|---|
| lowest coverage in any cell | 93.5% | 93.5% |
| weak-coder coverage given the split | 94.9% | 94.9% |
| summed width gain over a plain audit | 0.531 | 0.501 (94.4%) |
| draws where the floor fired | 0 | 280 of 13,677 |

The floor did no harm and cost 5.6% of the gain, which passes the 90% bar set in
advance, so the default stays. Before the run I expected the naive Bayes coder to be
expensive, since its J sits right at the 0.40 ceiling. It was not. Past an audit of
300 that coder shows 5 or more misses in nearly every pilot, so the floor almost
never fires, and it kept 96.6% of its gain.

## The honest reading

There was very little to repair. On GoEmotions the unfloored rule undercovered,
given the split, in 8 of 105 cells. Here it did so in one of 27: the near-useless
Qwen 3B coder at 5% and n = 500, 84.6% of the 39 audits that split. The floor never
fired in that cell. Its failing pilots show many misses, the same kind 7az could not
reach. So this check confirms the floor is safe and cheap away from the corpus that
chose it, but its *repair* is still evidenced on GoEmotions alone. Where it did fire,
at 300 labels and 5% prevalence, it paid width for coverage that was already 95 to
97%.

Numbers: [`h7ba_floor_naija.txt`](../../research/llm-coding-inference/experiments/h7ba_floor_naija.txt);
log entry 7ba in the project's
[`LOG.md`](../../research/llm-coding-inference/LOG.md). One run, so each coverage
figure carries about ±1.4 points.
