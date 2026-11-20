---
title: "Forty-seven product labels took two lines on a phone"
seo_title: "Shortening hero eyebrows so they fit one line on a phone"
date: 2026-11-20
tags: [polish, design, mobile]
description: "47 of 184 tool pages opened with a small capitals label that wrapped on a 390 px phone. Each now fits one line, and a test keeps them under 39 characters."
---

Most tool pages on this site open with a small line of capitals above the
headline: who the tool is for. On a desktop it reads as a label. On a 390 px
phone, 47 of the 184 product pages wrapped it onto two lines, and seven took
three lines at 320 px. The longest read *FOR MANUFACTURING, INDUSTRIAL AND
LEAN ENGINEERS, PLANT MANAGERS AND STUDENTS*. A label that wraps stops looking
like a label and pushes the headline and the tool down the screen.

Measured in Chromium (the label's height divided by its line height), every
label of 38 characters or fewer sat on one line at 390 px; at 39 characters,
3 of 11 wrapped (wide letters such as W and M). So each long label was cut to
the reader it names first, at 39 characters or fewer:

| Page | Before | After |
|---|---|---|
| Assembly line balancer | FOR MANUFACTURING, INDUSTRIAL AND LEAN ENGINEERS, PLANT MANAGERS AND STUDENTS | FOR MANUFACTURING AND LEAN ENGINEERS |
| Gig driver net pay | FOR DOORDASH, UBER EATS, INSTACART, UBER & LYFT DRIVERS | FOR DELIVERY AND RIDESHARE DRIVERS |
| IFTA fuel tax | FOR SMALL CARRIERS AND OWNER-OPERATORS FILING THEIR OWN IFTA | FOR CARRIERS FILING THEIR OWN IFTA |
| HVAC load calc | FOR HOMEOWNERS, BUILDERS AND HVAC CONTRACTORS | FOR HOMEOWNERS AND HVAC CONTRACTORS |

Cutting has a cost. The delivery apps are still named in the gig page's
body, but on most pages the dropped readers (students, plant managers,
estimators, fixers) appeared only in the label, so the page no longer names
them at all. The label keeps the reader most likely to search for the tool;
the others can still use it, and a page that wants them back can say so in
its lede, where there is room.

| Width | Labels on 2+ lines, before | After | Total label lines, before | After |
|---|---|---|---|---|
| 390 px | 47 | 0 | 231 | 184 |
| 320 px | 100 (7 on three lines) | 93 (none on three) | 291 | 277 |

On the two pages screenshotted the headline moved up 18 to 19 px. A test in
`platform/pages/flagship-hero-order.test.mjs` now fails any product label over
39 characters, so the next page added starts at one line.

The 320 px column is still mostly two-line labels. Fixing it would mean a
cap near 30 characters, which starts cutting the trade name itself; that is
left for a run that measures whether a smaller label size reads better there.
