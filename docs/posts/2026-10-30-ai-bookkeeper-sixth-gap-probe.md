---
title: "A sixth gap probe for ai-bookkeeper: 47 of 79 right before, 4 confidently wrong"
seo_title: "Bank line categorizer test: cafes, lawyers, vets, SaaS founders"
date: 2026-10-30
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "79 made-up bank descriptions for five more kinds of small business went through the built-in rules before any change: 47 right, 4 wrong, 28 no suggestion."
---

We keep testing ai-bookkeeper's built-in categorizer on bank lines for business types we haven't covered. This round: cafes and bakeries, solo lawyers and real-estate or insurance agents, landscaping and cleaning crews, veterinary and chiropractic practices, and early SaaS founders.

The descriptions are made up from public company names, and the expected accounts were written down before the first run. Before any change the rules filed 47 of 79 correctly, got 4 wrong and had no suggestion for 28.

The 4 wrong ones were rule-order mistakes: a coffee roaster filed as meals, a veterinary distributor as repairs, MLS fees as a licence, and an insurance-department licence as insurance. Those are the costly kind, because a wrong suggestion looks like an answer. The silent ones go to review.

After new rules (practice-management software, bar dues, fleet fuel cards, incorporation services), all 79 are filed correctly. That number is tuned on the same list, so it counts coverage, not accuracy. Costco, John Deere Financial and Y Combinator stay unsuggested on purpose, because the same line can be personal or business.

Code and the probe list: `ventures/ai-bookkeeper/eval/probe6.mjs`. We still want real labelled books.
