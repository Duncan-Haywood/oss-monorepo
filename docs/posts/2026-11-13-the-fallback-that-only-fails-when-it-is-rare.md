---
title: "The fallback that only fails when it is rare"
seo_title: "LLM coding audits: why a guard-first fallback undercovers when rare"
date: 2026-11-13
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 45 audit cells: a guard-first fallback adds 20% width gain but undercovers where it is rare, since the pilot that chose the design is reused."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library's audit rule hand-codes a
pilot, then splits the rest of the audit into the model's "yes" and "no" piles
when the pilot says that will narrow the interval. A guard asks for at least 3
positives in the pilot's "no" pile first.

[This morning's step](2026-11-13-the-guard-that-refuses-the-best-coder.md) found
that the guard and a plus-four variance floor fail in opposite places. The guard
turns away the coders too good to show 3 misses. The floor charges every coder
for a risk only the best ones run. So this step tested the obvious combination,
pre-registered before any draw. If the pilot passes the guard, plan exactly as
the library does now. If it does not, use the floored split instead of giving up
on it. The test ran on the 39 cells already on file plus 6 fresh ones the rule
had never seen: GoEmotions *amusement* and *love*, coded by a word-presence
logistic model (J 0.59 and 0.76), at audits of 500, 1,000 and 2,000. Each cell
got 1,000 simulated audits.

## What happened

- **It buys real width.** The width gain summed over the 39 cells rises 20%,
  from 2.76 to 3.32. Gratitude at n = 500 goes from 0.98 to 0.835 of a plain
  audit's width. On the fresh cells it is never wider than the shipped rule, and
  love at n = 1,000 goes from 0.83 to 0.71.
- **It undercovers where it should be safest.** At n = 2,000 the 95% interval
  covers 92.4% (gratitude) and 92.5% (love). That breaks the pre-registered 93%
  bar, so the library default is unchanged.

## Why

The failures sit where the fallback is rare. In a large audit the guard passes
in most draws, so the draws that fall back are the unlucky pilots with unusually
few positives in the "no" pile. The pilot's labels are reused in the final
estimate, so those draws estimate the "no" pile too low. A split of the same
draws, added after the pre-registered summary was read, shows this. Where under
16% of draws fall back, the fallback draws cover 42 to 63%, and every miss lies
below the truth. Where most draws fall back (small audits), they cover 98%.

The mirror image was already inside the shipped rule. At n = 500, the draws
where a strong coder passes the guard cover only 88.6 to 90.2%. A pilot that
happens to hold 3 misses overstates the "no" pile. The rule's average of about
94% holds because the plain-audit draws carry it.

So a design chosen from pilot labels that the estimate reuses is valid only on
average over that choice. A variance floor cannot fix this, because the bias is
in the point estimate. The next step is to pre-register a two-phase estimate that
leaves out the pilot items that chose the design, and to report coverage
conditional on the choice for every rule, the shipped one included.

Code and tables: [`h7an_guard_first.py`](../../research/llm-coding-inference/experiments/h7an_guard_first.py),
[`h7an_guard_first.txt`](../../research/llm-coding-inference/experiments/h7an_guard_first.txt),
[`h7an_conditional.txt`](../../research/llm-coding-inference/experiments/h7an_conditional.txt).
Limits: one run, 1,000 draws per cell (±1.4 points on coverage), and the
conditional splits rest on 10 to 160 draws where the fallback is rare. The two
fresh categories use one non-LLM coder, and the split was not pre-registered.
