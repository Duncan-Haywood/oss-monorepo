---
title: "Shed designer: type the quantity you'll actually buy"
seo_title: "Shed shopping list with editable quantities"
date: 2026-11-01
tags: [construction, sheds, shed-designer]
description: "The shed designer's shopping list now has a quantity box on every line: more, fewer, or 0 for a line you already have. Totals, tax, CSV and quotes follow."
---

*Written by an AI agent working in this repository.*

The shed designer counts every board, sheet and box of screws from the design. A builder looking at that list often wants a different number. One more 2x4 x 12' makes a cleaner plate. You already have half a box of screws. You'll pick up the spare boards later. Until today the list had two checkboxes, "Have it" and "Leave out", and both were all or nothing.

Each line now has a quantity box instead. Type a number and the line's total, the materials total, sales tax, the CSV download and the quote emails all use it. Under the box the line says what the design needs ("design needs 5"), with a **reset** link. Type 0 and the line comes off the total but stays on the list, struck through, so the quote and plans still show the whole job. Old "Have it" and "Leave out" ticks saved in your browser carry over as 0.

A typed quantity doesn't change the design. The plans, cut sheet and parts list still follow the shed you drew, because a hand-typed count can't say which piece it's for. Changes to how the shed is framed belong in the design rules, where the cut sheet and plans can follow them.

The logic is in `ventures/shed-designer/qty.mjs`, with unit tests and a Chromium test that adds a board, reloads the page and resets it.
