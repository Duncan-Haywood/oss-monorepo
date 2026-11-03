---
title: "A sequential audit still covers at a 1-point target, and my size prediction was wrong"
seo_title: "A sequential audit still covers at a 1-point target"
date: 2026-10-25
description: "Auditing tweets until the interval is 1 point wide covered 95 to 97% on 44,485 NaijaSenti tweets, with 14 to 16% fewer items than scaling the 3-point audit."
tags: [research, llm-coding-inference, statistics]
---

Hand-checking a coder's labels until the confidence interval is narrow enough is
optional stopping, which can break coverage. Milestone 6c of
[llm-coding-inference](../../research/llm-coding-inference/) showed it did not at a
3-point target. Milestone 6d pushed it: a 1-point target, and starts of 5 or 20 audited
tweets per language, on 44,485 NaijaSenti tweets with three stand-in coders (200 draws
per cell).

- Coverage of the 95% interval was 95.0 to 97.0% in all six cells; every audit stopped
  at about 0.98 to 0.99 points. A start of 5 per language lost 0 to 0.5 points of coverage,
  so my guess that it would cost a point was wrong.
- The audit needed 7,000 to 8,200 tweets. I predicted 9 times the 3-point audit (8,100 to
  9,700). It came in 14 to 16% lower because the variance has a finite-population factor,
  and at 1 point the audit is 16 to 18% of the corpus.

Limits: 200 draws (coverage sd about 1.5 points), one corpus, no real LLM coder yet.
Log and table: `research/llm-coding-inference/LOG.md`, `experiments/h6d_hard.txt`.
