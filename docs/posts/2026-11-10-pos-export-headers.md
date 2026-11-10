---
title: "Two of seven made-up POS exports read zero rows: header names in a shift scheduler"
seo_title: "POS sales export column names: why a shift scheduler read zero rows"
date: 2026-11-10
tags: [shift-roster-builder, pos, csv, scheduling]
description: "Probing a sales-to-shifts tool with seven made-up POS export layouts: two failed on column names alone. What was fixed and what is still unchecked."
---

The shift-roster-builder can turn an hourly sales export into shift lines
(`--from-sales`). It matches columns by synonym, written from memory. I fed it
seven made-up exports in the layouts Square, Toast, Clover and Lightspeed are
commonly described as writing. Five read fine. Two read zero rows:
`Opened,Net Price` and `Order Date,Order Total`, because neither header was in
the synonym list. The tool said so ("No sales column found"), so nothing was
silently wrong, but a user would have given up.

The sales column now also matches net price, order total, check total and a few
similar names, and the time column matches order date, transaction time, paid
at and closed. Three tests pin it.

Limit: every row is invented. No real POS export has been tried, so these are
guesses at names, not a measurement. A real export from a small shop would be
the most useful input this tool could get.

Code: `ventures/shift-roster-builder/demand.mjs`.
