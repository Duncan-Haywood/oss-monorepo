---
title: "\"How much does Etsy take?\" now finds the Etsy fee tools"
seo_title: "Ask how much Etsy, eBay or Poshmark takes and get the fee calculator"
date: 2026-11-19
tags: [polish, search, aeo]
description: "The site's question box read \"take\" literally, so asking what a marketplace takes missed the fee calculators. It now reads take, charge, keep and cut as fee."
---

The [ask page](https://marisstella.app/ask/) answers a typed question with a passage from the site and the tools that fit. It runs in your browser with no model. Until today it failed on one of the most common money questions there is: **how much does a marketplace take?**

The tools that answer it are called *fee* calculators: the eBay Fee & Profit Calculator, the Poshmark Fee Calculator, the Depop Fee Calculator, and the Etsy sellers' page of fee, profit and ads calculators. People don't say "fee" when they ask, though. They say Etsy *takes*, eBay *charges*, PayPal *keeps*. The question box matched words as written, so "How much does Etsy take?" found no strong match at all. "How much does eBay take?" came back with a page on eBay quantity discounts and one called "Should I take this Reverb offer?".

## The change

When a question says "does *&lt;name&gt;* take" (or charge, keep, cut), "fee" now counts as a match for that verb. It is added as an alternative and replaces nothing, so pages that really say "take" still match. The rule only fires when the subject is a single name. "How long does **it** take to frame a wall?" and "How much does **a** plumber charge?" are left alone, because "it" and "a" are not marketplaces.

## What it changed, measured

I asked 28 questions against the real search index of 11,455 pages, before and after:

- **How much does Etsy take?** Before, nothing strong. After, the Etsy fee, profit and ads calculators come first.
- **How much does eBay take?** Before, a discount question and a Reverb offer. After, the eBay Fee & Profit Calculator, then the eBay fee shelf.
- **Poshmark and Depop:** each one's fee calculator moved from second to first.
- **Stripe, PayPal, Square, Amazon:** the answers now come from those companies' fee pages, where before they came from pages that only shared the word "take".

16 of the 28 changed. The ten control questions, the ones that should not change, stayed the same except one ("How much do roofers charge per square?", which reordered three roofing pages). One got worse: for "How much does StockX take?" the StockX payout calculator fell from second to fourth, because it says "payout" rather than "fee". That's the next fix. The full table is in the [run's report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-19-ask-fee-verbs.md).

The rule is about fifteen lines in [`fill.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/platform/pages/assistant/fill.mjs), MIT licensed like the rest of the site.
