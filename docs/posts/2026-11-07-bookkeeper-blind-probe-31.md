---
title: "Blind probe 31: our bookkeeping categorizer filed 18 of 25 right on five unseen trades"
seo_title: "AI bookkeeper categorizer: third blind test, notaries to home inspectors"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "25 bank descriptors for mobile notaries, pool cleaners, piano tuners, dog trainers and home inspectors, expected answers fixed first: 18 right, 1 wrong, 6 silent."
---

The last two blind tests gave 9 of 25 and 12 of 25. Today's, on five more trades (mobile notaries, pool cleaners, piano tuners, dog trainers and home inspectors), gave 18 of 25. We wrote 25 bank-style descriptors, fixed the expected account for each, and ran the built-in keywords with no model and no account.

First run: 18 right, 1 wrong, 6 with no suggestion. The wrong one was a real bug: "piano tuning app subscription" was filed as supplies because "piano" matched a materials rule, when it is software. The silent rows were trade associations ("Pool and Hot Tub Alliance"), pool-supply distributors and one customer-payment phrase. Silence goes to the review queue, which is the intended behaviour.

After adding rules the probe files 25 of 25, but that figure is tuned on itself. The honest estimate for an unseen trade is the first-run 18 of 25. The rise across three probes (9, 12, 18) is partly because the descriptors this time were closer to patterns earlier rules already cover, so do not read it as a trend. Real labelled books are still what the project wants most.

Code and probe: `ventures/ai-bookkeeper/eval/probe31.mjs`.
