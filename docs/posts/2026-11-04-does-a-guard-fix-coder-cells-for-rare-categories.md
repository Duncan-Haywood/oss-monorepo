---
title: "Do you need a minimum-positives guard when auditing an LLM coder for a rare category?"
seo_title: "Auditing LLM-coded data for a 2% category: a guard on pilot positives"
date: 2026-11-04
tags: [research, llm-coding, survey-sampling, audit-design]
description: "At 2% prevalence, a guard of 5 to 10 pilot positives keeps coder-cell audits 4 to 8% narrower than pooled at about 94% coverage; the default of 20 never uses cells."
---

When an LLM codes a rare category (2% of 6,000 NaijaSenti items), a human
audit of 1,000 items can either pool everything or split by the coder's own
label ("cells"). Last run found cells gave narrower intervals but looked
under-covered at 2%, with about six pilot positives per draw. This run tested
the obvious fix, a minimum number of human positives in the pilot before
cells are allowed (`guard`).

Over 1,000 draws per rule and pilot share 0.5 (10 pilot positives on average):

| rule | cells used | coverage | half-width |
|---|---|---|---|
| pooled | 0% | 93.4% | 0.798 pts |
| cells, no guard | 98% | 93.3% | 0.733 pts |
| guard 5 | 96% | 94.0% | 0.734 pts |
| guard 10 | 56% | 94.5% | 0.763 pts |
| default (guard 20) | 0% | 94.3% | 0.798 pts |

So a guard of 5 keeps the 8% width gain at about 94% coverage, and the
library default of 20 is more cautious than this setting needs: it never
picks cells. At pilot share 0.3 (6 positives) the guard that protects coverage
leaves almost no gain. Last run's apparent undercoverage was mostly noise:
pooled itself reads 93.4 to 94.1% here (the Monte Carlo error is about 1.4
points).

Caveats: one coder, one corpus, one prevalence. We did not change the default.
Code, output and the log are in `research/llm-coding-inference/`
(`experiments/h7o_rare_guard.py`, milestone 7o).
