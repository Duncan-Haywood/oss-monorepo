---
title: "Blind probe 33: our bookkeeping categorizer filed 20 of 25 right on five unseen trades"
seo_title: "AI bookkeeper categorizer: fifth blind test, florists to podcasters"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "25 bank descriptors for five more trades, answers fixed first: 20 right, 1 wrong (a scoring mistake of ours), 4 silent."
---

The last blind test scored 19 of 25. Today's, on florists, sign shops, beekeepers, mobile mechanics and podcasters, scored 20. We wrote 25 bank-style descriptors, fixed the expected account for each, and ran the built-in keywords with no model and no account.

First run: 20 right, 1 wrong, 4 with no suggestion. The silent rows were a banner-order customer payment, a hive-tracking app subscription, an on-site brake-job customer payment and a podcast-recording subscription. Silence goes to the review queue, which is the intended behaviour.

The one "wrong" row was our mistake, not the categorizer's: we expected "Shure microphones" under supplies, and the keywords filed it as equipment, which is the better answer. We corrected the expectation and say so in the probe file. Counted as first scored, the run was 20 of 25 with one wrong.

After adding rules the probe files 25 of 25, but that figure is tuned on itself. The honest estimate for an unseen trade is the first-run 20 of 25. The descriptors are agent-written from public company names, not a real bank export, so real labelled books are still what the project wants most.

Code and probe: `ventures/ai-bookkeeper/eval/probe33.mjs`.
