---
title: "204 free tools now point at the paid product their users need"
seo_title: "Turning free calculators into front doors for SMB software"
date: 2026-11-24
tags: [marketing, site, monetization]
description: "204 free tool pages now link the paid SMB product their users need. Narrow rules pick the pairs, and a link shows only once its product page exists."
---

This site has about 1,400 free single-purpose tools. As of today they are not
the point. They are front doors: someone who finds the roofing bid calculator
is a roofer, and a roofer's real problem is getting paid. The paid products
this site is building are for small and mid-sized businesses in five
industries: construction, manufacturing, online sellers, e-invoicing and
nonprofits.

So 204 tools, two category pages and ten audience pages are now mapped to the
product their visitors are plausibly customers for. Each one carries a short
line linking that industry's page. The exception is 18 tools that already name
a specific product in their footer (from
[an earlier change today](2026-11-24-pointing-free-tools-at-the-products.md)):
they keep that line, so no footer carries two pitches.

## Which tool points where

A wrong pairing on a calculator page reads as an ad, and it costs the trust
the free tool earned. So the rules are narrow, and the uncertain cases are
listed by hand
([`front-doors-map.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/pages/front-doors-map.mjs)):

- **Construction (129 tools):** the trades shelves that are building work by
  definition (HVAC, plumbing and electrical; roofing and siding; windows and
  doors; interiors; concrete and site work), plus hand-picked envelope,
  outdoor and getting-paid tools such as the retainage and lien-deadline
  calculators. Lawn care, snow removal and cleaning bids are left out: that is
  service work, and pay-app billing is not what those businesses need.
- **Online sellers (57):** tools whose slug names a selling platform
  (eBay, Etsy, Poshmark, Whatnot, Shopify and others), plus a hand list of
  reseller tools such as the liquidation pallet bid. The marketplace shelf as
  a whole was tried first and rejected: it also holds short-term-rental hosts,
  course creators and streamers, who are not resellers.
- **Manufacturing (9), nonprofits (8), e-invoicing (1):** hand lists only.
  Few tools fit, and a word like "grant" also appears in RSU-grant tax tools.

Matching on words only counts in business categories. Without that limit,
"contractor" matched UK IR35 calculators, and "amazon" matched a cloud storage
check.

## What the line says

Each line states the product and its real status, for example "In development
— early access: pay-app billing for subcontractors (G702/G703, retainage,
lien waivers, change orders), growing into a contractor suite." It ends with
"A separate product; this tool stays free." It names no price, and a test
rejects one. Clicks are counted the same way as every other link on the site,
locally in the visitor's browser.

A line also appears only if its industry page has actually been built. Those
pages are being written in parallel today, so until one ships, its doors stay
hidden. No page links to a 404 in the meantime.

## The headline change

Category pages used to lead with the word "Free" ("Free contractor bid
calculators and estimating tools"). The visible heading now drops it. The
small line under the hero still says the tools are free with no account,
because that is still true. The search title is unchanged, so search results
look the same.

## What next

Once the industry pages are live, the click counts will show which doors
people open. The mapping is one script. Moving a tool or adding an industry is
a rule change and a rerun.
