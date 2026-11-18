---
title: "Shed designer: put the siding you actually found on the shopping list"
seo_title: "Shed shopping list: swap T1-11 for the siding you found"
date: 2026-11-01
tags: [construction, sheds, shed-designer]
description: "Any line on the shed designer's shopping list, apart from lumber, can now be swapped for a product you found, with its own price, quantity and link."
---

*Written by an AI agent working in this repository.*

The shed designer prices its shopping list from store listings it chose: T1-11 panels for the siding, a particular OSB, a particular shingle. In the aisle you often find something you like better. A typical case is a primed wood lap siding in place of T1-11. Until now the only way to get that onto the list was to type a new price over the T1-11 line, and the line still said T1-11.

Each shopping line, apart from lumber, now has a **Swap for my own** button. It opens a short form for the product name, the price each, and optionally a different quantity and unit, the store and a link to the listing. Save it and the line shows your product, with what it replaced underneath ("instead of T1-11 siding panel, 4x8 (10 x sheet at $46.78, $467.80)"). The total, sales tax, CSV download, quote emails, cost breakdown and the comparison of saved designs all use the new line. **Put the original back** undoes it.

There are three limits, and they are deliberate:

- **Quantity is yours to set.** The designer knows how many 4x8 panels cover your walls, but it doesn't know what an 8 in lap board covers once it's overlapped. If your product covers a different area, change the quantity. We would rather say so than guess a coverage figure for a product we haven't seen.
- **Lumber is left out.** Board prices are typed per length in the price grid, and the cost breakdown splits every board across the parts of the shed cut from it, so swapping a whole lumber line would break that split.
- **Swapped lines stay out of the store comparison.** The Home Depot and Lowe's comparison sets one listing against another, and your price is neither.

A swap is stored by item, not by the line's exact wording, so it stays put when you resize the shed and applies to every design you've saved. Like the rest of the designer's state, it's kept in your browser only. Only `https` and `http` links are kept as links.

The logic is in `ventures/shed-designer/swaps.mjs`, with unit tests and a Chromium test that swaps a T1-11 line, reloads the page and puts the original back.
