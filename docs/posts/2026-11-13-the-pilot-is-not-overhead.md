---
title: "The pilot is not overhead: a smaller pilot gave up a third of the gain"
seo_title: "LLM coding audits: how big should the hand-coded pilot be?"
date: 2026-11-13
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 39 GoEmotions audit cells: cutting the pilot from half the audit to 30% left coverage intact but kept only 67% of the width gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share, once a
language model has coded the whole corpus. The library's audit rule starts with a
random pilot of hand-coded items. It then decides whether to split the rest of the
hand-coding into the model's "yes" and "no" piles. It refuses the split when the
pilot holds fewer than 3 positives that the model called "no" (the "3-miss guard").

The last two steps ([7ao](2026-11-13-the-repair-that-costs-more-than-the-fault.md),
[7ap](2026-11-13-the-fallback-line-closes.md)) tried a fallback for pilots that
fail the guard. The fallback was a two-phase design that does not reuse the
pilot's labels to estimate the rest. It was valid, but it never beat simply
refusing the split. The suspected reason was that, with a pilot of half the
audit, throwing the pilot out of the rest's estimate costs too much. A smaller
pilot should cost less.

There was a second reason to look. Every GoEmotions experiment since milestone 7y
used a pilot of half the audit. The library's own docstring suggests 30%. So the
rule as a reader would call it had never been run on those cells.

## What was tested

The prediction and the decision rule were committed before any draw. The run used
the same 39 GoEmotions cells as 7ap: three Qwen2.5 coders and two logistic
coders, audits of 500 to 2,000 items, 1,000 simulated audits per cell. The
pilots were nested: the 30% pilot is the first 30% of the same random 50%
pilot, so the rules differ only in how much of the pilot they see.

## What happened

| Rule | Pilot 50% | Pilot 30% | Pilot 20% |
|---|---|---|---|
| Shipped rule (guard, else pooled) | 4.059 | 2.723 | 1.733 |
| Two-phase fallback | 4.021 | 2.853 | 2.183 |

*Summed width gain over a plain random audit (sum of 1 minus the width ratio),
39 cells. Higher is better.* Every rule covered 93.4% or more in every cell.

- **The smaller pilot is the cost.** At 30% the shipped rule keeps 67% of the
  gain it has at 50%. At 20% it keeps 43%. I had guessed a loss of 0.3 to 0.8;
  it was 1.34. No cell got narrower by more than 0.002.
- **Why.** The pilot's labels are reused in the final estimate, so a bigger
  pilot costs no extra hand-coding. But the guard counts misses in absolute
  terms, and a smaller pilot holds fewer of them. With the strongest coder
  (gratitude, 2,000 items), the split was used in 84% of audits at a 50% pilot
  and 50% at a 30% one.
- **The fallback helps only when the pilot is small.** It beats the shipped rule
  by 0.13 at 30% and 0.45 at 20%. It never gets back to what a 50% pilot gives
  the plain rule.
- **A small fix held up.** 7ap found, after the fact, that a pilot the width
  forecast cannot read should go to the plain audit. Pre-registered here, it
  removed the one cell that was 3.7% wider than a plain audit.

## What it means

If you use this kind of audit: make the pilot about half the audit, not 30%. The
interval stays valid either way, but you give up a third of the narrowing. The
library's suggested share stays at 0.3 for now, because the decision rule
committed in advance only changed it if coverage failed. A pre-registered check
of 0.5 as the default, on the NaijaSenti cells and at shares above one half, is
the next step.

Limits: one run, 1,000 draws per cell (about plus or minus 1.4 points of
coverage), one corpus. Shares above 50% were not tested. Details, files and the
full prediction are in the project's [research log](../../research/llm-coding-inference/LOG.md)
and [`h7aq_pilot_share.txt`](../../research/llm-coding-inference/experiments/h7aq_pilot_share.txt).
