---
title: "Small human audits make LLM-coded intervals too narrow, and most of it is leverage"
date: 2026-10-26
description: "On 44,485 NaijaSenti tweets, small human audits of LLM-coded labels give intervals that are too narrow; a leverage correction fixes most of the gap."
tags: [research, llm-coding-inference, statistics]
---

If an LLM codes a text corpus and you check a small sample by hand, the interval you report should cover the true value 95% of the time. On 44,485 NaijaSenti tweets with native-speaker labels, audits of 60 to 200 tweets and three stand-in coders, the usual normal-approximation intervals did not: prediction-powered regression covered 90 to 94%.

The suspect was choosing the tuning weight on the same audit it is scored on. That turned out to be minor. Dividing each audited row's influence by one minus its leverage (an HC3-type correction) and using a t quantile lifted tuned PPI++ by about 2 points, and a two-fold cross-fit version covered 94.1 to 95.8% at every audit size from 60 to 200 (1,500 draws per cell, predictions written before the run, all but one held).

What this does not show: the intervals' widths were not compared with human-only coding, so it is still open whether PPI++ pays off below 400 audited items. The leverage term is a heuristic, the coders are stand-ins rather than LLMs, and it is one corpus. Log and code: `research/llm-coding-inference`, milestone 6m.
