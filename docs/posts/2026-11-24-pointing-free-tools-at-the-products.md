---
title: "85 free tools now name the product that does the whole job"
seo_title: "Linking free calculators to deeper tools: why word overlap failed"
date: 2026-11-24
tags: [marketing, site, monetization, lead-magnets]
description: "Until today none of our 1,400 free tool pages linked to the 20 products with real depth. Word overlap picked bad pairs, so 85 links were chosen by hand."
---

This site has about 1,400 free single-purpose tools and 20 products with real
depth, such as [Wall Framing Takeoff](/wall-framing-takeoff/),
[AI Bookkeeper](/ai-bookkeeper/) and
[Shift Roster Builder](/shift-roster-builder/). The free tools get found in
search. Until today, though, none of them linked to the product that does the
same job in full. Someone who used the
[weekly staff schedule maker](/weekly-staff-schedule-maker/) and wanted rules
for rest breaks and hour caps had no way to learn that the roster builder
exists.

## The obvious method picked bad pairs

The site already ranks related tools for each footer by shared rare words in
the name and description. So the first try scored every free tool against
every product with that same index. The top of the list looked fine: the
Gumroad and Square sales-to-journal tools matched
[Sales Export to Journal](/sales-export-to-journal/), and the shift rotation
generator matched the league scheduler. Further down, the word overlap took
over:

- a Docker build-secrets check scored 4.97 against Shift Roster Builder, the
  same score as a wedding-day timeline builder. Both share "build".
- a freelancer's Schedule C categorizer went to the league schedule generator
  ("schedule").
- a land-survey bid went to the pairwise survey tool, and a Roth-conversion
  bracket calculator to tournament brackets.

On a calculator page, a link to an unrelated product reads as an ad, and that
costs trust the free tool had earned. So the scores became a shortlist, and
the final list was picked by hand.

## What shipped

[`funnel.json`](https://github.com/duncan-haywood/oss-monorepo/blob/main/portfolio/monetization/funnel.json)
lists 85 free tools under 14 products. A tool goes in only when someone using
it is plausibly doing the job the product does in full. Some examples:

- the bank-statement converters and Schedule C categorizers point to
  AI Bookkeeper;
- 20 platform payout-to-journal converters point to Sales Export to Journal,
  which handles ten platforms in one place;
- the overtime, tip-pool and fair-workweek tools point to Shift Roster
  Builder;
- the cut-list optimizer, the PDF plan takeoff and the open house plans point
  to Wall Framing Takeoff.

Each listed tool's footer gets one line above "More free tools": "Doing this
as part of a bigger job?", then the product's name and what it does today.
The line names no price and no paid tier, because neither is live yet, and a
test rejects any pitch that mentions one. A click is counted in the visitor's
own browser as `product_offer_click:<product>`, kept apart from ordinary
cross-tool clicks.

Three products were left out on purpose: e-invoicing, the babysitting
business kit and the IFC model checker. No free tool fit them closely enough.
For e-invoicing, the nearest free tool is an EU VAT OSS calculator, and that
serves consumer sales, not the B2B invoices the mandates cover. Leaving them
with no link beats giving them a loose one.

## What next

When a product's paid edition opens, its line is already on the right pages.
The next step is a reading: once a few weeks of `product_offer_click` counts
come in, they will show which pairings people actually follow.
