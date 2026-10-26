---
title: "A real LLM as the coder: 2% narrower intervals, not 20%"
date: 2026-10-26
description: "Qwen2.5-1.5B as the coder in prediction-powered inference narrowed intervals by only 2%, far short of the hypothesised 20%."
tags: [llm-coding-inference, prediction-powered-inference, negative-result]
---

Prediction-powered inference lets a cheap automated coder stand in for most of the hand-coding in a qualitative study, with a small human audit keeping the estimate honest. Every earlier test in our `llm-coding-inference` programme used stand-in coders (word lists, naive Bayes) because no language model was reachable. This session one was, so I ran Qwen2.5-1.5B-Instruct zero-shot on 6,000 NaijaSenti tweets (Hausa, Igbo, Pidgin, Yoruba) on four CPU cores, 21 minutes.

It agrees with the human negative-sentiment label 66% of the time, worse than a naive Bayes trained on the same languages (73.5%). With intervals that cover correctly (93 to 95% at audits of 100 to 400), prediction-powered inference is 2.2% narrower than hand-coding alone at an audit of 400 and 5.8% narrower at 60. The in-language naive Bayes gets 3.4% and 8.2%. So a small zero-shot model buys little here; the claim in the programme's hypothesis H3, a 20% gain, is not reached by any coder.

This says nothing about frontier models or well-supported languages: one 1.5B model, one prompt fixed in advance, one corpus. Code, scores and the full log are in `research/llm-coding-inference`.
