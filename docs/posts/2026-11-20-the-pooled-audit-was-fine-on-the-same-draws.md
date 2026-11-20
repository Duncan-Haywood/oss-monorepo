---
title: "The pooled audit was fine on the same draws: a seventh repair for reused LLM-audit pilots"
seo_title: "Reused audit pilots for LLM-coded data: a seventh repair"
date: 2026-11-20
tags: [research, llm-coding-inference, qualitative-coding, negative-result]
description: "Pooling when the pilot's J_hat is under 0.40 repairs 7 of 11 failing cells and keeps 89% of the gain, the best of 32 repairs, still short of the bar."
---

Yesterday's post on the `llm-coding-inference` programme
([six ways to repair a reused audit pilot](2026-11-19-six-repairs-for-reused-pilots.md))
ended on an open question. The programme's audit rule reads a hand-coded pilot
of 70% of the audit. If the language-model coder looks informative, it splits
the remaining labels between the items the coder called positive and the items
it called negative, then reuses the pilot in the estimate. Averaged over all
draws, the 95% intervals cover close to 95%. Given that the rule chose the
split, they do not always cover: with weak coders, as little as 62%. Six
families of repair had each changed the *interval*. None had changed the
*design*.

Today's pre-registered milestone, 7be, changed the design, and only where the
pilot's informedness (Youden J_hat) reads under a ceiling. Two ways to do that:

- **pool** (jp40, jp50): use a plain random audit instead of the split;
- **don't reuse the pilot** (jt40, jt50): replan as a two-phase design that
  counts the pilot items exactly and estimates the rest of the coder-negative
  cell from fresh labels only. Given the pilot, those fresh labels are a clean
  random sample, so the selection that biases the reused estimate is gone.

The comparison used the same 157 cells and the same random numbers as the last
four milestones: 1,000 draws each, GoEmotions and NaijaSenti, a logistic
coder, naive Bayes and three zero-shot Qwen2.5 sizes.

## What nobody had measured: the pooled interval on the same draws

Every earlier milestone scored candidates on the draws whose pilot the default
split. None had scored the plain pooled interval on those same draws. That
interval reuses the pilot too, because the pilot is 70% of its sample, so I
predicted it would also undercover there, under 93% in at least 4 of the 7
failing cells.

It didn't. On the split draws the pooled interval covers **95.1%** over the 90
weak-coder cells, and 93% or more in 5 of the 7 failing cells:

| cell (coder, category, audit size) | split draws | default, given the split | pooled, same draws |
|---|---|---|---|
| logistic, approval, n = 1,000 | 43 | 69.8% | 95.3% |
| logistic, approval, n = 750 | 81 | 72.8% | 96.3% |
| logistic, annoyance, n = 750 | 56 | 62.5% | 91.1% |
| logistic, annoyance, n = 2,000 | 78 | 87.2% | 93.6% |
| logistic, disapproval, n = 1,000 | 258 | 87.6% | 93.0% |
| Qwen2.5-1.5B, disapproval, n = 1,000 | 35 | 74.3% | 85.7% |
| Qwen2.5-3B, NaijaSenti 5%, n = 500 | 39 | 84.6% | 94.9% |

So the conditional failure mostly belongs to the split estimator, not to the
pilot's selection as such. The same unlucky pilot, diluted by the other 30%
of the sample, does little harm in a pooled estimate. The selection is not
harmless either: the pooled interval falls under 88% in two cells the default
covers (logistic remorse and desire at n = 500).

## The two-phase design was never chosen

The rule only switches to the two-phase design when the width forecast prices
it at or under the pooled audit. At J_hat under 0.40 that never happened. The
jt rules equal the jp rules in every one of the 157 cells, to the last printed
digit, so in practice the gated "design change" is a pooling rule. Forced on
anyway (jf40), the two-phase design repairs 5 of the 7 cells and makes the
audit wider than plain random sampling in total: summed gain −23.4 against
+9.5 for the unrepaired rule.

## Pooling at J_hat < 0.40: the best trade yet, still short

| | jp40 | the bar |
|---|---|---|
| share of the default's GoEmotions width gain kept | 89.1% | 90% |
| failing cells (unrepaired rule: 11, default: 7) | 4 | fewer than 7 |
| new cells under 93% | 3 (92.2 to 92.9%) | 0 |
| share of the NaijaSenti gain kept | 60% | 90% |

On the programme's frontier plot jp40 is now the best balanced point of 32
candidates: 0.83 of the unrepaired rule's gain kept with 64% of its failing
cells repaired. The previous best that repaired half was 0.79. It still fails
the decision rule fixed before the draws, so the library default does not
change. Its three new sub-93% cells all sit within a point of the line, inside
the 1.4-point Monte Carlo noise, but that clause was committed in advance. The
0.40 was also chosen on these cells, so jp40 would need fresh cells before it
could become a default.

## What a practitioner takes from it

- The shipped rule's average coverage claim stands.
- If you need coverage *given* the design choice (for example, you only report
  the interval when the split was used), pool whenever the pilot's J_hat is
  under 0.40. On these data that costs about a tenth of the width gain on
  GoEmotions and two fifths on NaijaSenti, where the naive-Bayes coder sits
  right at J 0.39 to 0.42.

## A bug, found by an assertion

The first full run died on an assertion that no audit
labels more than its budget. The library's priced two-phase plan had labelled
604 items on a 600-item audit. An earlier milestone (7ar) had capped the
ordinary plan at n but missed this path. The fix uses the same cap, with a
test. The old behaviour is kept behind `plan_audit_pre7ar`, which the older
two-phase experiments call, so nothing committed replays differently. The
relaunch changed no prediction or rule.

Files: `research/llm-coding-inference/experiments/h7be_gated_design.py` (the
pre-registration is its docstring), `h7be_gated_design.txt`, and Section 6.1
of the paper draft, which now has seven families in its table.
