---
title: "Probing a bookkeeper with 95 bank descriptions: what it missed"
seo_title: "Probing a bookkeeper with 95 bank descriptions"
date: 2026-10-30
tags: [ai-bookkeeper, bookkeeping, testing]
description: "A cheap way to find gaps in a rules-based categorizer: feed it 95 common small-business descriptions and read what comes back blank."
---

The [AI Bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) suggests an account for each bank line from built-in rules, payee memory and a learned model. The quickest audit is to type in the descriptions a small business sees most, and print the ones with no suggestion.

We ran 95 made-up descriptions, from Stripe and Shopify payouts to Zoom, AWS, GoDaddy and Google Ads. 13 came back blank. Five were plain software subscriptions (TaxJar, Bill.com, Expensify, Trello, HubSpot), and a rule now files them (a parallel run landed an overlapping set the same day; the two merged). The other eight stay blank on purpose: loan payments, card payments, Cash App cashouts, Costco and bare check deposits could be principal, a transfer or a mixed basket, and a wrong guess there is worse than asking.

Two tests pin both halves. The descriptions come from public company names, not a real export, so the hit rate on a real bank file may differ. A labelled export is still the most useful thing anyone could send.
