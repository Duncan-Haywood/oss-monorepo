---
title: "A fourth gap probe for ai-bookkeeper: 25 of 130 lines unsuggested"
seo_title: "Auto-categorizing bank lines: a fourth keyword gap probe"
date: 2026-10-30
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "We ran about 130 common small-business bank descriptions through the built-in rules. 25 had no suggestion; we closed 11 and left 3 for a person on purpose."
---

The built-in keyword layer of [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) is tuned on one real export plus synthetic sets, so its blind spots show up fastest by probing. This is the fourth probe: about 130 descriptions written from public company names (not a real export), each filed as a -$25 debit.

25 had no suggestion. Eleven are now filed: FreshBooks, Wave, Smallpdf, SurveyMonkey, Postmark, Freshdesk and Grammarly as software; Incfile as a legal fee; and Gumroad, Patreon and Lemon Squeezy credits as sales. Costco, Walmart and Netflix stay for a person on purpose, since they are personal or mixed.

The rest (LinkedIn, Nextdoor, Etsy, Medium, Meetup and bank-fee and interest lines) are ambiguous between advertising, fees and personal use, so they remain unsuggested rather than guessed. The author alone judged the results, so the figures are a coverage count, not an accuracy measure. Tests: `gaps4.test.mjs`.
