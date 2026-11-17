---
title: "The guard that refuses the best coder, and why a variance floor is not the fix"
seo_title: "LLM coding audits: a plus-four variance floor vs a pilot miss guard"
date: 2026-11-13
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 39 audit cells: a plus-four variance floor lets a strong LLM coder into the split audit but costs weaker ones, so the guard stays."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library's audit rule splits the
hand-coding into the model's "yes" and "no" piles when a short pilot says that
will narrow the interval.

[Yesterday's held-out check](2026-11-12-the-width-rule-on-fresh-categories.md)
found an odd gap. The best coder, Qwen2.5-1.5B on gratitude (Youden's J 0.78),
gets almost nothing from the split at an audit of 500 items: 0.98 of a plain
audit's width, against a forecast of 0.67. The cause is a safety guard. The split
is used only if the pilot holds at least 3 positives the model called "no". A
good coder misses so few that a 250-item pilot rarely holds 3, so 90% of audits
fall back to the plain design.

The guard exists because a "no" pile with almost no positives in the audit gets a
variance estimate near zero, and the interval then undercovers. So this step tried
the direct fix instead of the proxy. It drops the guard and puts a floor under
each pile's variance at the plus-four value of Agresti and Coull,
p̃(1 − p̃) with p̃ = (k + 2) / (m + 4). It also tried smaller pseudo-counts of
0.5 and 1. The prediction and the decision rule were committed before any draw.
The test covered the 39 cells already on file (three Qwen2.5 coders on GoEmotions,
a naive-Bayes coder and an English lexicon on NaijaSenti, prevalence 1 to 10%,
audits of 500 to 2,000), with 1,000 simulated audits each.

## What happened

- **The guard is load-bearing.** Removing it with no floor makes 9 of 39 cells
  undercover a 95% interval, the worst at 80.2%.
- **The floor lets the good coder in.** With the plus-four floor, gratitude goes
  from 0.98 to 0.85 of the plain width at n = 500 and from 0.88 to 0.74 at
  n = 1,000. A pseudo-count of 1 gets 0.76 and 0.68. Coverage with the plus-four
  floor is 93.3% or more in every cell.
- **The floor is not free.** It also applies to the pilot, so the width forecast
  sees an inflated "no"-pile variance. It then sends middling coders (J 0.26 to
  0.46) to the plain design more often, and the audits it keeps get wider
  intervals. Anger at n = 1,000 goes from 0.91 to 0.98. Summed over the 39 cells,
  the floored rule keeps 79% of the shipped rule's width gain.

The pre-registered rule needed full coverage, no cell more than 1% wider than
plain, and at least the shipped rule's total gain. No pseudo-count passed, so the
library default is unchanged.

## What it means

The guard and the floor fail in opposite places. The guard refuses the coders that
are too good to show 3 misses. The floor charges every coder for a risk that only
the best ones run. The next step is to pre-register a rule that uses each where it
wins: keep the guard when it fires, and fall back to the floored split only when it
does not. It will be tested on a fresh strong-coder category so it is not fitted to
gratitude.

Code, data and the full table: [`h7am_pseudo_guard.py`](../../research/llm-coding-inference/experiments/h7am_pseudo_guard.py),
[`h7am_pseudo_guard.txt`](../../research/llm-coding-inference/experiments/h7am_pseudo_guard.txt).
Limits: one run, 1,000 draws per cell (±1.4 points on coverage), and the gratitude
gain comes from one category and one model.
