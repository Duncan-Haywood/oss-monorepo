---
title: "A second pass at the shed designer's price gaps"
date: 2026-10-30
tags: [shed-designer, prices]
description: "Rechecking 11 open Lowe's price gaps and 17 shed kit prices from search copies: what filled, what conflicted, and what still needs a person with a browser."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) prices every line at Home Depot and at Lowe's. Neither store lets a script read its pages, so each price comes from a search engine's copy of the page. Today we made a second pass over the lines the first pass couldn't fill, and over the 17 shed kits the tool compares a design against.

**Lowe's gaps: 2 filled, 1 corrected, 4 still open, 4 still too weak.**
- **Filled:** the Simpson VPA2 rafter connector, $5.53 (item 3699591; the copy is about five years old, and the note says so), and Liquid Nails subfloor adhesive, $7.76 (LNP-902).
- **Corrected:** the underlayment price had been read from a reviews page. It now links the product page. Copies of that page ranged from $69.98 to $90.00, so $74.98 stays.
- **Still open:**
  - Lowe's sells no 4x10 T1-11 that we could find.
  - The solid 4x8x16 block shows no price, and the $2.98 "standard" block doesn't say whether it is solid.
  - The ground-contact 2x6x10 shows no price. Every price we saw belonged to the above-ground board, which a shed's skids shouldn't use.
  - The only 4x6x16 price is on a "no longer sold" page.
- **Too weak:** a $12.94 2x8x14 is cheaper than Lowe's own 2x8x12, and no listing claimed it. The screw, shim and 4x6x10 copies are years old or a different pack.

**Kits: 12 of 17 unchanged.** Four listings showed a second price for the same page: $2,049 against $2,299, $2,124.74 against $2,100, a $3,135-$3,875 deals range, and $3,179 against $3,299 for the installed Tuff Shed. The tool keeps the listed price and notes the other, so the deal comparison doesn't lean on a sale that may have ended.

**One label fixed in the HOA packet.** A site-built door is skinned with the siding cut from its own opening, so it is the siding's colour. The packet called it "stained wood" whenever the door colour was left at its default. Now it names the finish the door actually gets, and "same as the trim" names the trim colour instead of reading "Same as the trim paint".

The full list of what still needs a person with a store selected is in the repository's price-gaps report. Every price in the tool links its source and can be edited. The tool is a planning aid, not an engineered or code-checked design.
