---
title: "A stricter screen keeps the wrong pilots"
seo_title: "LLM coding audits: a stricter J screen keeps the failing pilots"
date: 2026-11-14
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered on 87 cells: a stricter informedness bar for weak coders leaves the same undercovering cells, because failing pilots look like better coders."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library starts with a hand-coded
random pilot of 70% of the audit. If the pilot shows the model is informative (a
Youden J of at least 0.1) and missing at least 3 positives, the rest of the
hand-coding is split between the model's "yes" and "no" piles. Otherwise the rest is
drawn at random.

[The last step](2026-11-14-a-whole-audit-pilot-buys-nothing.md) left one weak spot.
Averaged over all audits, the interval covers the truth about 95% of the time. But
take only the audits where the rule chose the split design, with a weak coder, and
coverage drops below 88% in a handful of cells. A practitioner only ever sees one
audit, and in it they are told "split", so the average does not help them.

## What was tested

The obvious fix is to let only better coders in. Before any draw, I committed four
stricter tests and a rule for adopting one:

- a J floor of 0.2, or of 0.3, instead of 0.1;
- a lower confidence bound on the pilot's J (one standard error, or 1.645) that has
  to clear 0.1.

They ran on the 69 cells of the last step and 18 new ones (six GoEmotions categories
not used before in this line of work: confusion, desire, disappointment,
realization, disgust and nervousness), with 1,000 simulated audits each.

## What happened

| Rule | Width gain kept | Weak-coder cells still under 88% |
|---|---|---|
| J at least 0.1 (shipped) | 100% | 7 |
| J at least 0.2 | 98.8% | 6 |
| J at least 0.3 | 94.7% | 8 |
| lower bound (1 se) at least 0.1 | 98.4% | 6 |
| lower bound (1.645 se) at least 0.1 | 93.4% | 4 |

*A cell counts when the rule used the split design in 30 or more of its 1,000 audits
and those audits covered under 88%.*

- **None of them fixes it.** The stricter tests cost little width, but the failing
  cells stay, and they are mostly the same cells. The strictest rule still covers
  only 74% of the split audits for one weak coder at 1,000 items.
- **The replay shows why.** In the 7 failing cells, all 118 missed intervals were
  below the truth. The audits that missed had pilots that *looked like better
  coders*: a higher J (0.48 against 0.39 in one cell) and fewer of the model's misses
  in the pilot (3.8 against 7.3). They also had a "no" pile whose variance was
  estimated at a third to two thirds of its true value. A pilot that happens to see
  few of the model's misses makes the model look good and makes the hardest pile look
  calm at the same time. A stricter screen keeps those pilots and turns the honest
  ones away.
- **A side finding.** For nervousness (19 positives in 6,683 comments) even the plain
  random audit's interval covers only 72% at 500 items. The library's interval needs
  a rare-count fallback there.

## What it means

The 0.1 floor stays, because nothing beat it. The paper now says plainly that the
rule's coverage is an average over its own choice of design. Given that it picked the
split design for a weak coder, the interval can be too short. The fix has to work on
the variance of the model's "no" pile, not on who gets in. That variance fix is the
next pre-registered step.

Limits: one run, 1,000 audits per cell (about plus or minus 1.4 points of
coverage), 31 to 295 split audits behind each failing cell, one classifier family on
the new cells, and a mechanism read from a replay after the fact. Every number is in
the [research log](../../research/llm-coding-inference/LOG.md),
[`h7at_weak_admit.txt`](../../research/llm-coding-inference/experiments/h7at_weak_admit.txt)
and [`h7at_posthoc.txt`](../../research/llm-coding-inference/experiments/h7at_posthoc.txt).
