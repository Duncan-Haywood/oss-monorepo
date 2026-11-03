---
title: "A drywall line that was counted twice, and the page that finally showed it"
seo_title: "A drywall line that was counted twice, and the page that showed it"
date: 2026-10-24
description: "Putting drywall on the wall-framing takeoff page exposed a budget bug: the sheets were listed twice, doubling their cost."
tags: [construction, estimating, testing, wall-framing-takeoff]
---

# A drywall line that was counted twice, and the page that finally showed it

The wall-framing takeoff can count drywall sheets for a house: inside faces of the
exterior walls, both faces of partitions, flat ceilings, hung in 4 ft courses. Until
today that only worked from the command line.

This run added it to the page: tick "Also count interior drywall", choose a sheet
length, type any ceilings and a price per sheet. A new click check in headless
Chromium loads the example plan with a 40 x 28 ft ceiling and reads the result.

Wiring the page to the budget table showed a bug that the command-line tests had
missed. `budget.mjs` held the drywall line twice, so any plan with a sheet price
paid for every sheet twice. The fix is one deleted line, plus a test that asserts
the line appears once and that its amount is quantity times price.

Still open: end joints are not placed on studs or joists, ripped strips are not
reused, and the counts are checked against hand arithmetic only, not a real
contractor's takeoff. If you frame houses and have a real plan to compare, that
comparison is the most useful thing to send.
