---
title: "Checking a misjudged pilot with the labels drawn after it: the design leaves too few to check"
seo_title: "LLM coding audits: a second-phase check that fails"
date: 2026-11-17
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 157 cells: using fresh second-phase labels to catch a misjudged pilot repairs 2 of 7 failing cells and keeps 35% of the gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The audit rule the
library ships hand-codes a pilot of 70% of the budget. If the model looks
informative, the rest of the audit is split by the model's own label, and that
split is where it saves labels.

With a weak coder, the audits that choose the split can undercover. A
[floor that fires only on thin, low-informedness pilots](2026-11-16-conditional-floor-good-coders-pay.md)
fixed the cases it could see. Seven cells it could not see remain: 62.5 to 87.6%
coverage given the split, against a nominal 95%. Their failing pilots show plenty
of coder misses and a respectable informedness score. Nothing in the pilot
marks them.

## The idea

The labels drawn after the split were never used to choose it. In the
coder-negative cell (items the model called 0) they form a fresh random sample of
the items the pilot did not touch. So they should be able to catch a pilot that
under-saw the coder's misses. I committed three ways to use them, with
predictions and a decision rule, before any draw
([`h7bb_second_phase.py`](../../research/llm-coding-inference/experiments/h7bb_second_phase.py)):

- **v2:** use the larger of the cell's variance and its second-phase-only variance.
- **tp10, tp25:** if a binomial test says the second phase holds more misses than
  the pilot (p under 0.10 or 0.25), estimate the cell's unpiloted rest from the
  second phase alone, counting the pilot's labels exactly.
- **tp1:** do that in every split audit, as a cost reference.

I ran them on 157 cells (130 GoEmotions, 27 NaijaSenti, with logistic,
naive Bayes and zero-shot Qwen coders), 1,000 audits each.

## What happened

| rule | many-miss cells lifted to 88%+ | GoEmotions width gain kept |
|---|---|---|
| default (p5j40) | 0 of 7 | 100% |
| v2 | 2 of 7 | 34.5% |
| tp10 | 1 of 7 | −117% |
| tp25 | 1 of 7 | −393% |
| tp1 | 6 of 7 | −4,913% |

None qualifies, so the default stays
([summary](../../research/llm-coding-inference/experiments/h7bb_second_phase.txt)).
My guesses were far off: I expected tp10 to repair 4 of the 7 and keep 92 to 98%
of the gain. Instead it lowered coverage in five of the seven (1.5B disapproval at
n = 1,000: 74.3% to 68.6%). Overall it made the audit wider than a plain random
sample.

## Why

The design starves the check. A pilot of 70% of the budget already covers most of
the coder-negative cell. The allocation then sends nearly all of the remaining
30% to the coder-positive cell, where the variance is. So the cell that needs
checking often gets no second-phase labels, or a handful: none in 5 of the first 8
split audits for one category, 34 to 51 for another. A test on a handful of labels
has no power, so when it fires it is mostly reacting to noise. Rebuilding the cell
from those few labels multiplies a floored variance by the whole unpiloted rest,
and the width explodes. The gentler use, taking the larger variance, still costs
two thirds of the gain. Two-phase on every split audit does fix coverage, but at
up to 8.6 times the width of not splitting at all.

## What it means

Three families of repair have now failed on these seven cells: statistics read
from the pilot, a variance floor, and a check on the labels drawn after the split.
The many-miss failure is a property of reusing the pilot that picked the design.
The fix it seems to need, reserving fresh labels for the cell the pilot already
covers, is the kind of two-phase design that has lost width every time this
programme has tried it. The paper's limitation 6 now says so with these numbers.
Next is either one pre-registered test of a reserved second phase, or writing the
whole line up as a negative result about design pilots. Details are in the
[research log](../../research/llm-coding-inference/LOG.md).
