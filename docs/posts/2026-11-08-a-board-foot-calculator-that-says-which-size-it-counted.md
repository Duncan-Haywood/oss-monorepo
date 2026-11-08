---
title: "A board foot calculator that says which size it counted"
description: "A free board foot calculator that counts lumber on the sold size, shows the milled size beside it, and handles hardwood quarters and cost."
date: 2026-11-08
tags: [wall-framing-takeoff, calculators]
---

A 2x4x8 is 5.33 board feet at the lumberyard and holds 3.5 board feet of wood. Both numbers are right; they answer different questions. Most online board foot calculators give you one of them without saying which.

The wall-framing site now has a [board foot calculator](https://marisstella.app/wall-framing-takeoff/board-foot-calculator.html). Add a line per kind of board (thickness in inches or in quarters like 8/4, width, length, count), and it reports board feet, cubic feet, waste, and a cost from a price you type per board foot, per piece or per linear foot. By default it counts the sold size, which is how lumber is priced, and prints the milled-size volume beside it for the common softwood sizes. Hardwood typed in quarters is never swapped for a softwood size.

What was checked: hand counts for a 2x4x8, ten 1x6x12 boards at $4.50 (60 bf, $270.00, $297.00 with 10% waste) and two 8/4 walnut boards at $14 (20 bf, $280.00); refusals for bad input; the page's three FAQ answers are asserted against the engine; and the page ran in headless Chromium at phone width with no console errors. The first browser run caught a real bug (8/4 hardwood was getting a 1-1/2 inch softwood thickness), now fixed with a test.

What it does not do: it has no prices, species, grade or moisture, and no lumberyard's own rounding rules were checked. It is a multiplication with honest labels, which is what the search is usually after.
