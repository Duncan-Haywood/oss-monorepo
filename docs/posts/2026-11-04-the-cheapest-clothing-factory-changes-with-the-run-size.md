---
title: "The cheapest clothing factory changes with the run size"
date: 2026-11-04
description: "Clothing Design Studio now costs one garment on several factories' quotes and shows who is cheapest at 50, 100 or 1,000 pieces. Setup fees flip the ranking."
tags: [clothing-design-studio, manufacturing, pricing]
---

# The cheapest clothing factory changes with the run size

A designer who asks three factories for a quote gets three differently shaped
answers: one has a low price per shirt and a high screen setup, one a high
minimum order, one is slow. Comparing the unit prices tells you little.

The studio now has a [quote comparison page](https://marisstella.app/clothing-design-studio/quotes.html).
Import each factory's quote as a CSV sheet, describe one garment, and it runs
the same design through every sheet with the studio's existing costing: landed
cost per garment (fabric, cut and sew, decoration with the setup spread over
the run, trims, duty, freight), cash up front, margin after VAT and fees,
break-even, minimum order and lead time.

Two rules matter. A factory whose minimum order is above your run never wins,
and is flagged. Sheets in different currencies get no winner until you convert
them. A second table gives the cheapest factory at each run size, which is
where a setup-heavy factory with cheap units overtakes a low-setup one.

What is unproven: no real designer's set of quotes has gone through it yet.
The page ships no prices; the example sheet is placeholder numbers and is
labelled that way everywhere. The arithmetic is covered by tests that compare
each row to the single-sheet costing.
