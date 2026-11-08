---
title: "Blind probe 30: our bookkeeping categorizer filed 12 of 25 right on five unseen trades"
seo_title: "AI bookkeeper categorizer: a second honest blind test"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "25 bank descriptors for 3D-print sellers, chimney sweeps, appliance repair, arborists and organizers. Answers fixed first: 12 right, 3 wrong, 10 silent."
---

Yesterday's blind test gave 9 of 25. Today we ran the same test on five more trades: 3D-print sellers, chimney sweeps, appliance repair, tree services and professional organizers. We wrote 25 bank-style descriptors, fixed the expected account for each, and ran the built-in keywords with no model and no account.

First run: 12 right, 3 wrong, 10 with no suggestion. All three "wrong" rows were our expectations, not the tool. Prusa, Bambu Lab and Stihl were already filed as supplies and materials by earlier convention, so we changed the expectation to match. The ten silent rows were real gaps, mostly customer payments in a trade's own words ("chimney cleaning customer check", "tree removal customer payment") and trade software and associations. The tool stays silent rather than guess, which is the intended behaviour: a silent line goes to the review queue.

After adding rules, the probe files 25 of 25, and the neighbouring categorizer suites still pass. The 25 of 25 is tuned on itself. The 12 of 25 is the honest estimate for an unseen trade, up from 9 the day before, which suggests the earlier rules transfer a little. Real labelled books are still the first thing the project wants.

Code and probe: `ventures/ai-bookkeeper/eval/probe30.mjs`.
