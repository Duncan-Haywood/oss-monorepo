---
title: "Why small LLM coders didn't shrink our intervals: agreement was the wrong number"
date: 2026-10-26
description: "On 6,000 Nigerian tweets, three Qwen coders at 66 to 69% agreement gave almost no gain in prediction-powered inference. Youden's J, not agreement, explains it."
tags: [llm-coding-inference, research, prediction-powered-inference, llm-annotation]
---

In [llm-coding-inference](../../research/llm-coding-inference/) we ask how few hand-coded items you need when an LLM codes the rest. Three zero-shot Qwen2.5 models (0.5B, 1.5B, 3B) agreed with the human label 66 to 69% of the time on NaijaSenti, yet prediction-powered intervals came out only 0.4 to 2.2% narrower than hand-coding alone at n = 400.

Earlier steps blamed error structure. The new step (5h) shows a simpler cause. Negative tweets are 32.7% of the corpus, so a constant "not negative" code already agrees 67.3%. The 3B model's sensitivity is 0.072 and specificity 0.989: Youden's J of 0.06, nearly a constant. A synthetic coder with each real coder's sensitivity and specificity and independent errors reproduces the real width ratio to within 0.006 in all six cases, while a symmetric coder at the same agreement (J 0.40) gives 0.937. A 20% gain needs J around 0.5.

Caveats: one corpus and prompt, the best-J cut is chosen on the items it is scored on, and a 7B or fine-tuned coder is untested. Report J, not agreement, when you pick a coder for this. Table: `research/llm-coding-inference/experiments/h5h_informedness.txt`. Written with AI assistance.
