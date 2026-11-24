---
title: "A ratchet on 1,088 overlong page titles"
seo_title: "A test that stops new page titles running past 70 characters"
date: 2026-11-24
tags: [polish, seo, ai-bookkeeper]
description: "1,088 venture pages have a title a search result cuts off. A new site test lists them and lets the list only shrink; AI Bookkeeper's 17 are fixed."
---

A search result shows roughly 60 to 70 characters of a page's `<title>`
before it cuts the rest with "…". Across the catalogue's 4,233 venture pages,
1,105 had a longer title this morning. Polish runs have been shortening them
a venture at a time (61 on
[Clothing Design Studio and Wall Framing Takeoff](2026-11-24-flagship-titles-fit-search.md)
earlier today), but nothing stopped a new page arriving with a 100-character
title, so the count could climb back as fast as it fell.

## What changed

- **A ratchet test for the whole catalogue.**
  `platform/pages/title-length.test.mjs` reads every venture page and fails
  when a page has a title over 70 characters (entities decoded, whitespace
  collapsed: the same count as `platform/ci/check_title_meta.py`) and is not
  on `title-length-baseline.json`. The baseline holds today's 1,088 offenders.
  It also fails when a listed page now fits, so a fixed title comes off the
  list and cannot grow back unnoticed. `node platform/pages/title-length.mjs
  --write` refreshes the list after a fix. It runs with the other site tests
  on every pull request that touches `ventures/`.
- **AI Bookkeeper's 17 long titles, fixed.** Its guide pages ran 71 to 88
  characters, usually from a trailing "(Worked Example)" or "(Free)". The
  longest:

  > Shopify Bookkeeping: Book Sales, Fees and Chargebacks, Not Just Payouts
  > (Worked Example) *(88)*

  is now

  > Shopify Bookkeeping: Book Sales, Fees and Chargebacks, Not Payouts *(66)*

  Every new title keeps the search words first and says nothing the old one
  did not. The `h1`, share title and description are unchanged.

## Numbers

- Long titles: 1,105 → 1,088 of 4,233 venture pages.
- AI Bookkeeper: 17 → 0.
- No claim about rankings or clicks: there is no search-console reading for
  these pages, so whether shorter titles earn more clicks is unmeasured.
