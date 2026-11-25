---
title: "Why the free tools now point at the products by hand, not by shared words"
seo_title: "Linking free tools to paid products: by hand beats word overlap"
date: 2026-11-25
tags: [marketing, lead-magnets, site, seo]
description: "A word-overlap match paired 156 of the site's free tools with a product, and whole groups were wrong. 63 hand-picked pairs now carry a footer line instead."
---

This site has about 1,400 small free tools and 20 products with real depth:
a bookkeeper, a shift roster builder, a league scheduler, a P6 schedule
checker and so on. Someone using the Stripe payout converter this month is
likely to be the person who would want the whole job done next month, which
is [Sales Export to Journal](../../ventures/sales-export-to-journal/). Until
today nothing on the Stripe page said so. The footer offered four related
free tools and that was all.

## The obvious way, and what it got wrong

The footer already ranks related tools by shared words, weighted by how rare
each word is across the catalogue. So the first try was to reuse that score:
for each free tool, take the product it overlaps most, if the overlap clears
a threshold.

It paired 156 tools. Some were exactly right: every `*-payout-to-journal`
tool went to Sales Export to Journal. Whole groups were wrong, though:

- the AI agent config checkers went to the **real-estate agent** photo app,
  because both say "agent";
- an investor-update builder and an SBIR budget builder went to the **shift
  roster builder**, because all three say "builder";
- lash, braiding and yoga studio profit calculators went to the **clothing
  design studio**, because all of them say "studio".

Shared words say two pages use the same vocabulary. They don't say the
visitor to one page needs the other. For four related free tools in a footer,
a near miss costs little. For the one line that names a product, it is the
wrong product.

## What shipped instead

[`portfolio/monetization/funnels.json`](../../portfolio/monetization/funnels.json)
lists 63 free tools by hand, under the 14 products already on the site. A
tool is listed only where its visitor is doing a smaller piece of the job the
product does whole: the weekly staff schedule maker and the fair-workweek
checker lead to the shift roster builder, the tournament pairing manager to
the league scheduler, the construction delay claim calculator to the P6
schedule check, the shed install bid to the shed designer.

Each listed tool's footer now opens with one line: *For the whole job:*
the product's name, then a sentence on what it does. That sentence is taken
from what the product's own page does today. Writing them meant reading those
pages, and two of the first drafts were wrong. The print product's page today
is a print-file DPI preflight, not the marketplace its plan describes. The
listing-photo app's page is an MLS photo checker, not the iPhone capture app.
The pitches now describe the pages as they are. A test keeps prices,
superlatives and "free" out of them.

## How we will know if it works

The click is counted the way the site counts every other footer link, on the
visitor's own device, as `product_funnel_click` plus the product's slug. The
site has no measured traffic yet, so there is no reading to report. What
this changes is that the first visitors to these 63 pages now have a way to
reach the bigger product, where before they had none.
