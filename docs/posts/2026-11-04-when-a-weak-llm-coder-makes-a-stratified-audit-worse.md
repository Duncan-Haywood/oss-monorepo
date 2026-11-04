---
title: "When a weak coder makes a stratified audit worse"
seo_title: "Stratifying an audit by LLM code: when it widens intervals"
date: 2026-11-04
tags: [research, llm-coding, prediction-powered-inference, negative-result]
description: "At 2% prevalence on NaijaSenti, splitting the human audit by the coder's own labels narrowed intervals 8% for a decent coder and widened them 10% for a poor one."
---

When a model codes a rare category in a text corpus and people check a sample,
you can split that sample by the model's own labels (positive cell, negative
cell). Does that pay? We tested it on NaijaSenti tweets, with the "negative"
category thinned to 2% prevalence (6,000 items, audit of 1,000, 500 of them a
pilot, 1,000 repeated draws).

The answer depends on how informative the coder is (Youden's J, sensitivity
plus specificity minus one):

| coder | J | cells vs pooled half-width | coverage of cells |
|---|---|---|---|
| in-language naive Bayes | 0.34 | 8% narrower | 93.3% |
| English-trained naive Bayes | 0.11 | 8 to 11% wider | 95.1 to 95.8% |
| English lexicon | 0.02 | same | 93.9 to 95.0% |

Pooled intervals sit at 92.8 to 93.5% coverage in all three. The wider
intervals at low J are conservative, not wrong. Forcing the split costs
width when the coder carries little signal and the allocation is estimated
from about ten pilot positives, which is why the library screens on an
estimated J first. Coverage gaps near 1 point are inside binomial noise
(about 1.4 points) and are not claimed.

Limits: one corpus, one prevalence, three coders, no coder above J 0.34, and
the prediction for this run was held in mind rather than committed before it
ran. Code, outputs and the log are in
`research/llm-coding-inference/` (milestone 7p).
