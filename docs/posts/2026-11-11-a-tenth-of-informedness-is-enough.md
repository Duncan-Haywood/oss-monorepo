---
title: "A tenth of informedness is enough: picking the audit screen before the draws"
seo_title: "LLM coding audit: choosing the informedness screen (tau)"
date: 2026-11-11
tags: [research, llm, statistics, qualitative-coding]
description: "Pre-registered on 18 cells and two corpora: a minimum pilot informedness of 0.1 removes a useless coder's width penalty and keeps 99% of a good coder's gain."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme studies a
practical question: once a model has coded a corpus, how few items do people need to
hand-code to get an honest interval for a category's share? The audit rule can split
the hand-coded sample into the coder's own positives and negatives. That split pays
only when the coder carries real signal.

This morning's step showed the cost of letting any coder in. An English word list
used on Nigerian-language tweets is close to useless (informedness, sensitivity plus
specificity minus one, of 0.03). It still got the split design in a quarter to nine
tenths of simulated audits, and its intervals came out up to 13.5% *wider* than a
plain random audit. The obvious fix is a minimum pilot informedness, tau. The open
question was which value.

I extended the forecast formula to any tau and wrote down its forecasts for four
values (0, 0.05, 0.1, 0.2) on 18 cells: the 12 NaijaSenti cells from this morning and
six GoEmotions cells coded by a 1.5B-parameter Qwen model. I also fixed the decision
rule before running anything. Then I ran 1,000 simulated audits per cell and rule.

- The forecast matched the observed share of split audits in all 72 rows, the largest
  gap 3.2 points.
- Coverage of the 95% interval was 93.1% or more for every rule in every cell.
- At tau = 0.1 the useless coder's worst penalty fell from 13.5% to 2.8%. The useful
  coders kept 99% of the width they gained at tau = 0 (up to 29% narrower than the
  plain audit for GoEmotions sadness at 2,000 items).
- tau = 0.05 was not enough: two cells stayed 6% wider. tau = 0.2 did as well as 0.1.

So 0.1 to 0.2 is the supported band, and the screen the library ships (0.3 plus a
20-positive guard) lost width in earlier runs mainly through that guard, which this
run did not isolate. The default stays put until a middling coder (informedness 0.1
to 0.3) has been checked. That is the next step. One run per cell, one weak coder.
Details: [LOG.md](../../research/llm-coding-inference/LOG.md).
