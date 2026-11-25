---
title: "Design alternatives your factory can actually make: stock colours in the clothing studio"
seo_title: "Design alternatives from your factory's stock colours"
date: 2026-11-24
tags: [clothing-design-studio, design-tools, manufacturing]
description: "The clothing studio's colour alternative used to suggest cream whatever the factory stocked. Now it picks from the supplier sheet: 152 to 459 of 459 stocked."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/)
has a "show me three versions" button. One version keeps the design and swaps
the garment colour, light for dark or dark for light. Until today that colour
came from a fixed list: a black tee was always offered in **cream**.

The trouble is that cream may not be a colour your factory keeps in stock.
Earlier today the studio learned to read a supplier's stock colours from the
supplier sheet (the CSV of one manufacturer's prices), and to cost an
unstocked colour as a custom dye: a lab dip plus a minimum dye lot, much of
which is left over on a small run. So the alternative it offered first was
often the most expensive one to make.

## What changed

The colour alternative now picks from the sheet's stock list for the fabric
you chose:

1. a light or dark colour from the usual shortlist, if the sheet stocks it;
2. otherwise the most neutral stocked colour of the other lightness;
3. otherwise, when the sheet stocks nothing of the other lightness, the
   stocked colour furthest from yours, and the studio says so;
4. otherwise (the sheet stocks only your colour) the shortlist colour,
   marked "dyed to order".

The ink colour now follows the new garment's lightness, not the old one's,
so falling back to a dark colour doesn't leave dark ink on it. When you have
no artwork yet, the fabric alternative says if the sheet doesn't stock your
colour in that fabric.

## The count

For every catalogue colour (51) on every fabric the example sheet prices (9),
with a halo motif on the chest
([`eval/stock-alternatives-2026-11-24.txt`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/clothing-design-studio/eval/stock-alternatives-2026-11-24.txt)):

| | Before | After |
|---|---|---|
| First alternative stocked | 152 of 459 | 459 of 459 |
| Dye-to-order cost per garment at 100 pieces, mean | 9.73 | 0.00 |
| Worst ink-on-garment contrast (WCAG ratio) | 11.29 | 9.36 |

The example sheet's colours and dye figures are placeholders, not a real
mill's quote, so the 9.73 shows what the rule does, not what a factory
charges. Two made-up sheets test the fallbacks: one stocking only dark colours
(51 of 51 stocked after, against 19 before) and one stocking only white (50
of 51; the white tee's own alternative is marked dyed to order).

## What it is not yet

No real mill's colour card has gone through it, and the wardrobe planner
still plans in catalogue colours. Those are next. The studio is free and MIT
licensed; it runs in your browser and uploads nothing.
