---
title: "Stop hand-checking AI-coded data when the interval is narrow enough"
date: 2026-10-25
description: "Auditing in batches and stopping at a 3-point half-width met the target in every simulated audit at the same average size as knowing the true error rates."
tags: [research, llm-coding-inference, statistics]
---

A [previous step](2026-10-25-audit-size-from-a-pilot.md) of the
[llm-coding-inference](../../research/llm-coding-inference/) programme sized the
human audit of AI-coded text from a small pilot, and found it hit the target
interval width only about half the time. This step tests the alternative:
hand-code in batches and stop the first time the estimated half-width reaches
3 points.

On the NaijaSenti corpus (four Nigerian languages, three stand-in coders, 1,000
simulated audits per cell), starting from 20 tweets per language and adding
batches of 30 split across languages by the current variance estimates:

- all 1,000 audits in every cell stopped at or under 3.0 points;
- the mean audit was 898, 1,074 and 919 tweets against 902, 1,083 and 927 for a
  rule that knows the true error rates;
- coverage of the 95% interval was 94.2 to 95.2%, with no correction for
  stopping early;
- the audit size varied less than under pilot planning (sd 34 to 48 against 79 to
  119 tweets).

Batches of 90 cost about 30 more tweets. The price is operational: the audit has
to be hand-coded in rounds. Limits: one corpus, one 3-point target, stand-in
coders and no real LLM; the coverage result says optional stopping did not hurt
here, not that it never will.
