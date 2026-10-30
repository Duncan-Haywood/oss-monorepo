---
title: "How accurate must an LLM coder be to save you human labels?"
date: 2026-10-26
description: "A simulation on 6,000 real tweets shows an LLM coder's accuracy matters less than whether its mistakes track the text it codes."
tags: [llm-coding-inference, research, statistics]
---

We tested small Qwen models as coders for [llm-coding-inference](../../research/llm-coding-inference/) and none saved human labels. So what accuracy would? We replaced the model with a synthetic coder that copies the real human label and flips it at random, then swept its accuracy.

With random flips, a coder at 60% accuracy already narrows the confidence interval by about 2% at 400 audited labels. At 75% the gain is about 10%, and at 90% it is about 34%. At 90% and only 100 labels, the interval's coverage fell to 91.8% against a 95% target, so small audits need a cross-fitted estimator.

The real 1.5B and 3B models agreed with humans about 66% of the time yet gained almost nothing. Their errors follow the text and the language group, which random flips do not. If you want to know whether an LLM coder will pay for itself, measure how its errors correlate with your covariates, not just its agreement rate. One corpus, preliminary; the log has the full table.
