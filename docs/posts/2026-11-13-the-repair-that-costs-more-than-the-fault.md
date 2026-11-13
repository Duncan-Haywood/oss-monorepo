---
title: "The repair that costs more than the fault"
seo_title: "LLM coding audits: two-phase estimator fixes selection bias, at a cost"
date: 2026-11-13
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 51 audit cells: a two-phase fallback removes the pilot's selection bias (coverage 42% to 96%) but gives back more width than it saves."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest interval on a category's share once a
language model has coded the whole corpus. The library hand-codes a pilot, then
decides from it whether to audit the model's "yes" and "no" piles separately.

[The last step](2026-11-13-the-fallback-that-only-fails-when-it-is-rare.md) found
a fault in a promising rule. When the pilot that chose the design is reused in the
estimate, the rare pilots that triggered the choice drag the estimate down. Where
that choice was a tail event, those audits covered the truth only 42 to 63% of the
time, against a 95% target.

## The repair

This step tested the textbook fix, pre-registered before any draw: a two-phase
design. The pilot items count exactly for themselves, and only the rest of each
pile is estimated, from fresh items drawn after the decision. Once the pilot is
fixed, that is an ordinary stratified sample of a fixed remainder, so how the
design was chosen no longer matters. A width forecast still sends a pilot to the
plain audit when the two-phase plan would be wider.

It ran on the 45 cells already on file and 6 fresh ones (GoEmotions *remorse* and
*joy*), with 1,000 simulated audits each.

## What happened

- **The bias is gone.** In the audits that fell back to the split design, coverage
  is 100% at gratitude n = 2,000 and 96.0% at love n = 2,000. With the pilot reused
  on the same pilots it was 63.2% and 42.0%. Every one of the 51 cells covers 93.4%
  or more.
- **The width is gone too.** Summed over the 39 reference cells, the gain over a
  plain audit is 2.67, below the shipped rule's 2.76 and far below the 3.32 the
  biased version bought. At gratitude n = 1,000 the audit comes out wider than the
  shipped rule's (0.923 against 0.883 of plain).
- So the decision rule fixed in advance was not met, and the library default is
  unchanged.

Why it costs so much: the pilot here is half the audit. Throw it out of the
estimate for the rest and the "no" pile is estimated from about half as many
items, which roughly doubles its variance. The fallback design only earned 10 to
15% of width to begin with. A two-phase design on every plan is wider than a plain
audit overall.

The split we registered in advance also found something in the shipped rule. With
a weak coder (disapproval, J 0.135) at n = 1,000, the audits where the pilot let
the split through cover 83.3% (72 audits). It is the same selection problem,
coming through a different gate.

## What it means

Reusing the pilot is cheap and biased, and discarding it is clean and expensive.
The next steps aim between the two: estimate only the "no" pile from fresh items
(that is where the selection acts), use a smaller pilot for the fallback, or make
the width forecast price the variance floor that the closing interval applies to
the small second sample.

Code and tables: [`h7ao_two_phase.py`](../../research/llm-coding-inference/experiments/h7ao_two_phase.py),
[`h7ao_two_phase.txt`](../../research/llm-coding-inference/experiments/h7ao_two_phase.txt).
Limits: one run, 1,000 draws per cell (±1.4 points on coverage), and the
conditional splits rest on 50 to 190 audits. The pilot is half the audit, which
is close to the worst case for discarding it, and both fresh coders turned out
middling.
