---
title: "Why stratifying an LLM-coding audit by the coder's labels bought almost nothing"
seo_title: "LLM-coding audits: coder-cell split vs a fitted control variate"
date: 2026-11-03
tags: [research, statistics, llm-coding, prediction-powered-inference]
description: "A closed-form ceiling promised an 8% narrower interval from splitting a human audit by the LLM coder's label. Measured on NaijaSenti, the pooled audit with a fitted weight was already within 0.5%."
---

When an LLM codes a text corpus and humans audit a sample, you can split the audit by the coder's own label (coder-positive, coder-negative) and allocate more human labels to the noisier cell. A closed form says that for a coder with Youden's J of 0.39 this can shrink the interval by at most 8.4%.

Earlier steps of the `llm-coding-inference` programme found the realised gain on NaijaSenti (negative sentiment, n = 1,000 audited tweets, 1,000 draws per cell) was 0.6%, and that pilot size did not explain the gap. The last run tested the remaining candidate: the pooled audit fits a control-variate weight lambda, and the cells design does not need one.

| Pooled lambda | cells / pooled half-width |
|---|---|
| 0 | 0.915 |
| 1 | 0.834 |
| fitted | 0.995 |

The ceiling matches the lambda = 0 row exactly. Against a pooled audit that fits lambda, cells win by 0.5%, and coverage stayed 94.2 to 95.5% in all six cells. The library's `ceiling` is therefore an upper bound on what cells can add, not a forecast; its docstring now says so. One corpus and one coder were tested, so a rare category where the fitted weight is noisy is still open.

Code, logs and numbers: `research/llm-coding-inference/` (LOG.md, entries 7k to 7m).
