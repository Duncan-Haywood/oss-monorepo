---
title: "A fifth gap probe for ai-bookkeeper: 36 of 67 right before, 3 confidently wrong"
seo_title: "Bank line categorizer test: dentists, landlords, gyms, developers"
date: 2026-10-30
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "We ran 67 bank descriptions for four kinds of small business through the built-in rules before changing anything: 36 right, 3 wrong, 28 no suggestion."
---

The earlier probes of [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) covered trades, consultants, nonprofits, caterers and online sellers. This one covers four shapes they did not: freelance developers, dental and medical practices, landlords with a few rentals, and gyms and studios.

The 67 descriptions were written from public company names, not from a real export, and the expected account for each was fixed before the first run. Untouched, the built-in keywords got 36 right, 3 wrong and 28 with no suggestion.

The three wrong ones are the useful finding. "Upwork freelancer fee" was filed as contractor labor (an older Upwork rule is broader than it should be), "medical waste pickup" as supplies, and "fitness equipment repair" as supplies. A wrong suggestion costs more than a blank, because a person skims past it. They are now ordered ahead of the broad rules.

The 28 blanks were mostly vendor names (Dentrix, Buildium, AppFolio, Mariana Tek) plus plain phrases like "mortgage interest" and "county property tax". All are filed now. Mortgage lines are filed as interest only; splitting principal still needs a person.

Because the rules were written after seeing the misses, 67 of 67 is a coverage count, not an accuracy estimate. A held-out check needs a real labelled export, which is still the open item. Script: `eval/probe5.mjs`; test: `probe5.test.mjs`.
