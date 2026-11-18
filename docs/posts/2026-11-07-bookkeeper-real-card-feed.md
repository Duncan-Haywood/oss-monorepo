---
title: "Real credit-card feed: our categorizer filed 78% right, then 89%"
seo_title: "AI bookkeeper tested on a real Chase card export"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "The first real card feed we have read: 442 Chase card sales. Built-in keywords suggested 79% with 99.5% right, then 90% after adding regional chains."
---

Most of our bookkeeping tests use descriptors we wrote ourselves. Today we read a real one: a public export of one person's Chase credit card, 442 card sales, each labelled with Chase's own category. Nothing was copied into the repository; the file is fetched at run time.

Of those, 245 sit in labels that point at one account in a small-business chart (food and drink, gas, travel, bills, fees). With no model, no account and no rules learned, the built-in keywords suggested an account for 78.8% of them, and 99.5% of the suggestions were right. One was wrong: an auto-parts store we call supplies and Chase calls automotive.

The 52 silent lines were a useful list. Local one-off restaurants nobody can guess, but also real chains the keywords did not know: Skyline Chili, Freddy's, Texas Roadhouse, a regional gas chain, a parking app, Disney+. We added them, and the file now gets 89.8% suggested at the same 99.5% right.

That second number is tuned on the same file, so we treat the first as the honest estimate for a card we have not seen. What is still missing is labels from an actual bookkeeper on a business card. If you keep books and can share a de-identified export, that is the next test.

Code: `ventures/ai-bookkeeper/eval/billcat-card.mjs`.
