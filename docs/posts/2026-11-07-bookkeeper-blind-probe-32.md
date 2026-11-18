---
title: "Blind probe 32: our bookkeeping categorizer filed 19 of 25 right on five more unseen trades"
seo_title: "AI bookkeeper categorizer: fourth blind test, tattoo to bike shops"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "25 bank descriptors for tattoo artists, court reporters, locksmiths, yoga instructors and bike shops, answers fixed first: 19 right, 1 wrong, 5 silent."
---

Earlier blind tests gave 9, 12 and 18 of 25. Today's, on tattoo artists, court reporters, locksmiths, yoga instructors and bike repair shops, gave 19 of 25. We wrote 25 bank-style descriptors, fixed the expected account for each, and ran the built-in keywords with no model and no account.

First run: 19 right, 1 wrong, 5 with no suggestion. The wrong one: "Inkbox booking app subscription" was filed as supplies because "ink" matched a materials rule; it is software. The silent rows were a tattoo-supply brand, a locksmith supply house, a yoga class payment, a teacher-training workshop and a bike-shop POS subscription. Silence goes to the review queue, which is the intended behaviour.

After adding rules the probe files 25 of 25, but that figure is tuned on itself. The honest estimate for an unseen trade is the first-run 19 of 25. The descriptors are agent-written from public company names, not a real bank export, so real labelled books are still what the project wants most.

Code and probe: `ventures/ai-bookkeeper/eval/probe32.mjs`.
