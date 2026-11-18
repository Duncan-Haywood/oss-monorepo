---
title: "A floor that fires only on thin pilots: it fixes the cells it can reach, and good coders pay for it"
seo_title: "LLM coding audits: a count-triggered variance floor"
date: 2026-11-16
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 114 cells: flooring only pilots with 3 or 4 coder misses repairs 4 failing cells but keeps 79% of the gain; good coders pay most."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The shipped audit rule
hand-codes a pilot, and if the model looks informative it splits the rest of the
audit by the model's own label. That split is where it saves labels.

It has a known flaw. With a weak coder, the audits that choose the split can
undercover: 69.8 to 87.8% in 8 of 105 cells, against a nominal 95%. The cause is a
pilot that happens to see few of the coder's misses. That makes the coder look
better than it is and shrinks the variance the interval uses. A fix that inflated
that variance in every audit
([milestone 7au](2026-11-15-a-variance-floor-that-costs-the-whole-gain.md))
repaired most of the failing cells, but it threw away most of the method's gain.

## What was tested

The obvious next step is to inflate the variance only when the pilot's evidence is
thin. The prediction and decision rule were committed before any draw
([`h7ay_cond_floor.py`](../../research/llm-coding-inference/experiments/h7ay_cond_floor.py)).
The candidate floors fire only when the pilot holds fewer than 5 (or 8) coder
misses, or when the cell's audited labels hold fewer than 8 positives. The test
used 7au's 105 cells plus 9 fresh ones, with 1,000 simulated audits each.

Before the run I wrote down that three failing cells were out of reach: their
failing audits already hold 7 to 22 misses, so no count trigger fires there.

## What happened

| Rule | Failing cells left (of 8) | Weak-coder coverage given the split | Width gain kept |
|---|---|---|---|
| Shipped (no floor) | 8 | 94.8% | 100% |
| Floor in every audit (7au) | 2 | 96.6% | 42.4% |
| Floor when the pilot has 3 or 4 misses | 4 | 95.7% | 78.8% |
| Floor when under 8 misses | 3 | 96.0% | 62.6% |

The 3-or-4-miss trigger fires in 17% of the audits that split. It repairs the four
cells it was aimed at as fully as the always-on floor (96.6 to 100%). The
out-of-reach cells stayed broken, as predicted.

It still fails the bar, which was 90% of the gain kept. It keeps 78.8% overall and
lost 0.070 of gain on the fresh cells, where 0.05 was allowed. **No rule
qualifies, so the default stays unfloored.**

## Why

62% of the gain the trigger gives up is lost on *good* coders. A good coder misses
few positives, so its pilots often show only 3 or 4 misses, and the trigger fires.
With the strongest fresh coder (gratitude, J 0.75, an audit of 1,000) the width goes from
0.776 of a plain random audit to 0.807. The miss count cannot tell a good coder
that rarely misses from a weak coder whose pilot was unlucky. A stricter screen on
the pilot's measured accuracy failed in 7at for the same reason.

One honest slip: a clause of my decision rule required no cell under 93% where the
plain audit covers. The shipped rule itself fails that in one cell, and a
conditional floor never fires there, so no candidate could pass it. The verdict
does not depend on it, because the gain clauses fail on their own. The
[log](../../research/llm-coding-inference/LOG.md) records it.

## What it means

Three repairs on the pilot's side have now failed: a stricter admission test, a
uniform variance floor and a count-triggered floor. Each one either selects the
unlucky audits or charges the good coders. The next candidate has to use evidence
the pilot does not hold, such as labels drawn after the pilot. Otherwise the paper
states the limitation: the shipped rule's coverage holds on average over its
choice of design, and not given that choice.

Code, draws and summary:
[`experiments/h7ay_cond_floor.txt`](../../research/llm-coding-inference/experiments/h7ay_cond_floor.txt).
