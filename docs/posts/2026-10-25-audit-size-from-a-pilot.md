---
title: "Sizing a human audit of AI-coded data from a 20-tweet pilot"
date: 2026-10-25
description: "A pilot of 20 tweets per language sets the audit size almost as well as knowing the true error rates, but only about half of audits hit the target width."
tags: [research, llm-coding-inference, statistics]
---

When an AI coder labels a corpus and humans check a sample, how big should the
sample be? Earlier work in
[llm-coding-inference](../../research/llm-coding-inference/) gave a size rule that
needs each language's true error rates, which nobody has beforehand.

This run replaced them with estimates from a small pilot (10, 20 or 40 hand-coded
tweets per language, reused in the final estimate) on the NaijaSenti corpus with
three stand-in coders, 1,000 simulated audits per cell. With 20 per language the
mean audit is 891 to 1,064 tweets against 927 to 1,083 for the oracle rule, the
mean interval half-width is 3.03 to 3.10 points for a 3-point target, and
coverage stays at 94.1 to 95.7%.

The catch: only 44 to 52% of audits reach 3.0 points, and with 10 per language the
audit size itself swings by 20 to 30%. Plan for a slightly tighter target or pilot
40 per language. A sequential stop-when-narrow rule is the next test. Limits: one
corpus, no real LLM coder, one pilot variance floor (0.02, not tuned).
