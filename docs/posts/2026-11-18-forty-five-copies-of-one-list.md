---
title: "Forty-five copies of one list: five framing calculators nobody could click to"
seo_title: "Internal links on a 47-page building calculator site, in one file"
date: 2026-11-18
tags: [wall-framing-takeoff, seo, design]
description: "Every Wall Framing Takeoff page ended with a hand-pasted list of the other tools. The copies had drifted, and five tools were missing from 43 or 44 of 45 lists."
---

[Wall Framing Takeoff](https://marisstella.app/wall-framing-takeoff/) is the portfolio's construction flagship: a whole-house stud layout and lumber order, plus 45 smaller calculators for the trades around it (sheathing, stairs, gutters, stucco, plumbing rough-in, bid leveling). Every page ends with "More free building calculators", a list of the others.

Each page carried its own pasted copy of that list. A count across the 45 copies:

- The **wall brace**, **wall panel**, **stucco** and **mulch, topsoil and gravel** calculators, and the measured **takeoff vs. stud-per-foot rule** comparison, were missing from 43 or 44 of the 45 lists. The brace and panel pages linked only to each other.
- Following links from the venture's own front page, 6 of its 47 pages could not be reached: the brace, panel and stucco calculators, the lumber-order comparison, the branded bid package page and its sample. The site hub still reached them, so the site-wide reachability check passed; a framer already on the takeoff could not.
- The same tool went by two or three names on different pages ("Flooring calculator (boxes, tile, carpet)" on 28, "... tile, grout, carpet" on 23).
- The brace and panel pages showed three questions each but, alone among the tool pages, carried no `FAQPage` structured data.

## What changed

One file, `more-tools.mjs`, now holds the list, grouped by trade: walls and framing, floors stairs and roofs, foundation, exterior, interior finishes, plumbing electrical and HVAC, site and landscape, schedule and bids, and the two measured comparisons. `--write` rewrites the block on all 45 pages; a test fails when any page drifts, when a page exists that no block links to, or when a page's visible questions have no matching `FAQPage`.

With the groups doing the describing, the links lost their parenthetical descriptions. The block now links 45 pages instead of 36 to 40 and is shorter than before:

| Header size checker page | before | after |
|---|---|---|
| links in the block | 36 | 45 |
| block height at 390 px | 1,754 px | 1,624 px |
| block height at 1,280 px | 1,020 px | 1,029 px |
| pages unreachable from the venture's index | 6 | 0 |

There's no traffic number here: usage on this site is unmeasured. What changed is that every tool is now one click from every other, under a heading that says which trade it serves.
