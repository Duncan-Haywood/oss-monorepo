---
title: "29 more page titles that fit a search result, and no page left without a description"
seo_title: "Shorter search titles for league, eBay and babysitting tools"
date: 2026-11-24
tags: [polish, seo, league-schedule-generator, ebay-fee-calculator, babysitting-business-kit]
description: "League Schedule Generator, eBay Fee Calculator and Babysitting Business Kit had 29 page titles a search result cuts off. All now fit in 70 characters, and every indexable venture page has a meta description."
---

A search result shows roughly 60 to 70 characters of a page's `<title>`
before it cuts the rest with "…". After the
[title ratchet](2026-11-24-title-ratchet.md) landed this morning, 1,088
venture pages were still over 70 characters. The three ventures with the
most were League Schedule Generator (14), eBay Fee Calculator (8) and
Babysitting Business Kit (7).

## What changed

- **29 titles cut to 53 to 70 characters.** Search words stay first, and
  every fact comes from the old title. The page's `h1`, share title and
  description are unchanged. Some examples:
  - *Setting up your babysitting business: sole proprietor or LLC, EIN,
    insurance, bank account, records and licensing* (113) became *Setting up
    a babysitting business: sole prop or LLC, EIN, insurance* (67).
  - *Tournament Bracket By Number Of Teams: Byes, Rounds And Games For 3 To 32
    Teams* (79) became *Tournament Bracket by Number of Teams (3 to 32):
    Byes, Rounds, Games* (68).
  - *This calculator vs. eBay's own Fee Calculator and Fee Illustrator | eBay
    Fee & Profit Calculator* (96) lost the repeated brand suffix (65).
- **No indexable page lacks a meta description.** The checker counted 17
  pages with no description, but nine were sample documents already marked
  `noindex`, which never appear in results, so they never needed one.
  `platform/ci/check_title_meta.py` now skips `noindex` pages, with a test.
  The other eight were internal commercial-viability assessments in
  photo-editing and retail-pilot-intel. They are written for us, not for
  people searching, so they are now `noindex` too.

## Numbers

- `check_title_meta.py`: long-title 1,088 → 1,059, no-description 17 → 0
  (4,235 pages).
- `title-length-baseline.json` refreshed with `node
  platform/pages/title-length.mjs --write`, so the fixed titles cannot creep
  back past 70 characters.

We have no search-console reading for these pages, so this post claims no
ranking or click change. It only claims that the titles now show in full.
