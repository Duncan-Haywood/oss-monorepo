---
title: "The tools at the foot of each page were the next four in the alphabet"
date: 2026-11-16
tags: [design, seo, tooling]
description: "Each tool page links to four related tools. In big categories that meant alphabetical neighbours: 2,974 of 5,512 links shared no word with the page. Now 14 do."
---

Every one of the catalogue's 1,378 tools ends with a short list called "More
free tools": four links to other tools a reader of this one might want next.
It is the main path from one tool to another, for people and for search
engines, which read those links as a statement of what is related to what.

The list was chosen by tier: tools in the same sub-group first, then the same
category, then the rest of the site. Only the trade bids have sub-groups. The
other categories hold 35 to 219 tools each, and inside a tier the pick was a
rotation by the tool's own position in the catalogue. Since the catalogue is
sorted by name, that rotation came out as "the next four tools in the
alphabet".

Two examples from the live site:

- **Vendor Watch**, which watches a vendor's terms page and shows a diff when
  it changes, offered Vendor Change Evidence, Vendor Change Watch, a VPAT
  generator and a Wise statement converter. The first two are related only
  because their names sort beside it.
- **The Mann-Kendall trend test** offered a forecast calibration check, a
  ranked-choice ballot counter, robust PCA and SPC charts.

## What changed

The ranking now scores each pair of tools by the words their names and
descriptions share. Each shared word is weighted by how rare it is across the
catalogue (a word in 1 of 300 tools counts for much more than one in 1 of 6),
and a word in both names counts four times one in both descriptions. Words
the whole catalogue repeats, such as "free", "calculator" and "browser",
count for nothing. The category still matters: sharing a category adds a
bonus worth about one rare shared word, so when nothing overlaps the old tier
order holds, but a tool elsewhere that shares a lot can beat a same-category
tool that shares nothing.

Ranking by overlap has a side effect: popular tools get linked more and some
tools get linked by nobody. A second pass fixes that the way the blog's
related posts already do. Each tool that no footer links to takes the
weakest slot of its closest match, but only when that slot's current tool is
linked from somewhere else too.

## Before and after

Measured on the 1,378 tools in the built catalogue (the same names and short
descriptions, the old rule against the new one):

| | before | after |
|---|---|---|
| links that share no distinctive word with their page | 2,974 of 5,512 | 14 of 5,512 |
| tools that no other tool's footer links to | 36 | 1 |
| most footers linking to one tool | 13 | 18 |

The "no shared word" count uses the same word list the ranking uses, so it
measures whether there is any overlap at all, not whether a person would
judge the link a good one. The examples are a better check. Vendor Watch now
offers Vendor Change Watch, Vendor Change Evidence, Public-Record Watch and
MCP Supply-Chain Watch. The trend test offers STL decomposition, a Kalman
smoother, a changepoint detector and dynamic time warping. The eBay fee
calculator, which used to offer two product-CSV checks for Wix and
WooCommerce, offers Where to Sell, a print-on-demand profit calculator and
two other eBay tools.

The table above compares the two rules on the catalogue's short descriptions.
The site build uses each tool's full description, and the built pages come
out slightly better: no tool is left without an inbound link, and the most
any one tool is linked from is 16 footers. AI Bookkeeper, which the short
descriptions paired with two CRM import checks, links to the PayPal, Square,
YouTube AdSense and Payoneer statement-to-journal converters in the build.

The code is `relatedTools` and `relatedToolsTable` in
`platform/pages/build.mjs`, with tests in
`platform/pages/related-tools.test.mjs`.
