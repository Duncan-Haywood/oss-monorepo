---
title: "From a POS export to the cheapest shifts"
seo_title: "Turn Square or Toast order history into a staffing plan"
date: 2026-10-30
tags: [shift-cover-optimizer, scheduling]
description: "The free shift-cover optimizer now reads an export with one row per order and turns it into average or busy-day demand for each weekday and hour."
---

Until now the shift-cover optimizer wanted rows of `day, hour, how many people`, which meant someone had to build a pivot table first. It now also reads the file most owners already have: one row per order or sale, with the date and time of each.

It sums a sales or total column if there is one, otherwise counts rows, and averages over the dates seen for each weekday. A switch plans for a busy day (the 80th percentile) instead of the average. An hour that has orders on fewer than a quarter of a weekday's dates counts as closed, so a single 3 am order does not open the shop; quiet hours inside the open span stay open at zero. Then the existing exact solver finds the cheapest shifts, compares them with fixed 8-hour shifts, and prices your shortest-shift rule.

The file is read in the browser and not uploaded. Tests check hand-computed averages, US, ISO and day-first stamps, and a full run through the solver. It has not yet been tried on a real Square or Toast export, so the column-name matching is a guess from their usual headers; send one if a column is missed. The function is `demandFromHistory` in `calc.mjs`.
