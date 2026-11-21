---
title: "Our AI bookkeeper's breadcrumb said 'Compliance checks', and six trackers were filed by their last word"
seo_title: "A bookkeeping section, and a suffix rule that shadowed six tools"
date: 2026-11-21
tags: [polish, seo, information-architecture]
description: "46 bookkeeping tools sat in three unrelated sections, and a suffix rule overrode six placements other rules made by name. A new section and two tests fix both."
---

Every tool page on this site carries a breadcrumb: Home, then its section,
then the tool. The same trail goes into the page's `BreadcrumbList`
structured data, which is how a search engine knows what kind of page it is
looking at. It is also the visitor's way to find related tools.

On [AI Bookkeeper](../../ventures/ai-bookkeeper/), one of the site's flagship
apps, that section was **"Compliance checks & evidence records"**. That is
the section for EU regulation checkers and dated audit records. The 25
payout-to-journal converters (Stripe, PayPal, Ko-fi, Etsy and others), the
bank-file converters (BAI2, camt.053, MT940, PDF statements) and the
OFX/QIF/IIF checks were filed there too. Five more journal tools (Amazon,
eBay, Etsy, KDP, Shopify) sat under marketplace fees. Eight QuickBooks, Xero
and bank-reader tools sat under back-office money.

## How it happened

A slug's section comes from an ordered list of rules, and the first rule that
matches wins. Rules mix prefixes, suffixes and exact slug lists. Over the
months the journal tools were added to the evidence rule one line at a time,
each with a note saying "filed beside" the one before. Every step was
reasonable, but the result put a bookkeeper's tools in a compliance section.

The look turned up a second, quieter bug. The evidence rule also matches any
slug ending in `tracker`, `desk` or `record`, and it runs before the business
sections. So `time-tracker`, `expense-tracker`, `freelance-lead-tracker` and
`sales-call-notes-desk` never reached the freelancer section, even though
that section lists each one by name with a dated comment. `s-corp-basis-tracker`
and `grant-writer-proposal-price-calculator` were shadowed the same way.
Those six named lines did nothing.

## What changed

- A new **Bookkeeping, bank files & journals** section, at
  [/c/bookkeeping/](https://marisstella.app/c/bookkeeping/), holds 46 tools:
  every `*-to-journal` converter by suffix, plus an exact list of 21 bank-file,
  accounting-import, 1099 vendor and ledger tools. It has its own
  search-shaped title and description, an intro, and a ledger icon on the hub.
- The marketplace rule now skips `-to-journal` slugs, so all 30 journal tools
  sit together.
- The evidence rule skips six named slugs, so they land where their sections
  already said they belong.
- Two tests. One pins the bookkeeping placements, and it fails if any future
  `*-to-journal` tool lands elsewhere. The other fails when any tool in
  evidence is also matched by a later section's rule. That kind of overlap
  shadowed six tools without anyone noticing, so now the build catches it.

Section sizes after the change: evidence 121 → 84, back-office 181 → 173,
marketplace 100 → 95, solo-earner 73 → 77, bookkeeping 46. Tool URLs did not
change, because a tool's address never includes its section. Only
breadcrumbs, structured data and section pages moved.

## What it does not show

We cannot say yet whether a bookkeeping section page ranks for "convert bank
statement to OFX" or "Stripe payout journal entry". The site's usage
measurement is first-party and sparse. What changed is what each page says
about itself: AI Bookkeeper's structured data now names a bookkeeping section
instead of a compliance one.
