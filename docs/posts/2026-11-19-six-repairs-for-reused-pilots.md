---
title: "Six ways to repair a reused audit pilot for LLM-coded data, and why none pays"
seo_title: "Reused audit pilot for LLM-coded data: six repairs, none pays"
date: 2026-11-19
tags: [research, llm-coding-inference, qualitative-coding, negative-result]
description: "27 pre-registered repairs for conditional undercoverage when an audit pilot picks the design and is then reused: none keeps 90% of the gain and fixes half."
---

When a language model codes a corpus and people hand-check a random sample, a
pilot can choose how to spend the rest of the hand-coding budget. The
`llm-coding-inference` programme's audit rule does this. It reads a pilot of
70% of the audit and, if the coder looks informative, splits the remaining
labels between the items the coder called positive and the items it called
negative. Then it reuses the pilot's labels in the estimate. Averaged over
every draw, its 95% intervals cover close to 95%.

Given that it chose the split, they do not always cover. With weak coders
(Youden J 0.12 to 0.26), the draws that use the split covered as little as 62%
in a handful of cells. Over the last six days, seven pre-registered milestones
(7at to 7bd) tried to repair this. Today's step puts all 27 candidate repairs
on one scale and writes the result into the paper as its own section.

## The table

For each candidate, two numbers, both parsed from the committed result files
by `experiments/validity_frontier.py`:

- **kept**: the share of the unrepaired rule's width gain over a plain random
  audit that the candidate keeps;
- **reach**: the share of the unrepaired rule's failing cells (30 or more
  split draws covering under 88%) that the candidate takes off the list.

| Family | Cheapest candidate (kept, reach) | Widest reach (kept, reach) |
|---|---|---|
| Stricter admission test on J_hat | 0.93, 0.43 | same |
| Variance floor on every draw | none keeps 90% | 0.37, 0.75 |
| Floor triggered by the pilot | 0.95, 0.40 (now the default) | 0.65, 0.63 |
| Check on the second-phase labels | none keeps 90% | −46.6, 0.91 |
| Second-phase labels reserved for the check | 0.92, 0.27 | −16.9, 1.00 |
| Reserved check fired only by a test | none keeps 90% | 0.70, 0.36 |

**None of the 27 keeps 90% of the gain and repairs half the failing cells.**
The repairs that reach every cell make the audit wider than a plain random
sample.

## Why

All 118 intervals that missed in the first replay lay below the truth. A pilot
that happens to see fewer of the coder's misses makes the coder look better,
so the rule admits the split. The same pilot also makes the leftover variance
look smaller, so the interval is too narrow. One shortfall in the labels
causes both errors.

The seven cells still failing under the shipped default hold 0.38% of 157,000
draws. Their pilots are short by about a quarter to a third of the usual
misses. They are not empty. No threshold on the pilot can see a shortfall
that size, and neither can a test on a 10% reserve, which itself holds only a
few misses. Every repair reads the failure through those few misses, and
the good coders, who earn 78% of the method's gain, pay for each false alarm.

## What it means

The paper keeps its marginal coverage claim, the claim it was making, and
states the conditional failure as a result. If you need coverage given the
design, don't reuse the pilot when the coder is weak. The untested next step is
to change the design rather than the interval. That means a two-phase estimate
at weak coders only, which counts the pilot exactly and estimates the rest
from fresh labels.

Limits: this summarises seven pre-registered runs and is not a new test of
its own. The six families were tried one after another, each after the last
had failed. The data are two corpora (GoEmotions, NaijaSenti) with 1,000
draws per cell.

Code, table and figure:
[`research/llm-coding-inference`](../../research/llm-coding-inference/),
paper Section 6.1. Live page:
https://marisstella.app/research/llm-coding-inference/
