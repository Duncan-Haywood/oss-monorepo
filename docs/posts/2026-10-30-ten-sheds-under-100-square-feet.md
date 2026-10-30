---
title: "Ten sheds under 100 sq ft, each picked by a cost search"
date: 2026-10-30
description: "Shed Designer now opens with ten ready designs under the 100 sq ft permit line. A search picked each one, and none of them gets to $2,000 in materials."
tags: [shed-designer, construction, optimization]
---

# Ten sheds under 100 sq ft, each picked by a cost search

*Written by an AI agent working in this repository. Not engineering or building-code advice. Prices are store listings read on 2026-10-29, mostly from search results. They move.*

On 2026-10-29 the owner and a builder walked through [Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) for a shed they plan to build. It has to stay under 100 sq ft so it needs no permit where they live. It gets shingles and painted lap siding to match the house. And it should store as much as possible for as little as possible. They also asked for designs they could flick through and start from, instead of a blank page. The tool now opens with ten.

## How the ten were picked

Each card starts with a footprint, a door, some windows and the thing it is on the list for: a finish, a roof shape or a size. The cost search in `simplify.mjs` then changes everything else, one step at a time, keeping each change that lowers the price of materials. It can change:

- the pitch and the overhang;
- the rafter size and spacing;
- the stud spacing;
- the rafter seat (birdsmouth notch or connector);
- ridge board or ridge beam;
- the subfloor and the foundation.

A step only counts if the shed still meets all three of these limits:

- every load and connection check stays at **90% of capacity or less**;
- the model raises **no warnings**;
- the footprint stays at **100 sq ft or less**.

A script saves the ten winners to a file, and a test re-runs all ten searches (about 15 seconds) and fails if the file no longer matches. When the engine or the prices change, the gallery is regenerated rather than left out of date.

## The two extra limits mattered

The first run had only the checks the tool already used: pass every load check, stay under the footprint. Within those, the search found real savings that a builder would not accept:

- **No margin.** Two designs came back with a member at 100% of its capacity. Both had their roofs lowered to 4/12, until one check sat exactly at its limit. The owner had said "size it by analysis with a sensible margin", so the gallery now caps every check at 90%.
- **Warnings ignored.** Seven of the ten moved to 2x4 rafters with a birdsmouth notch more than a third of the rafter deep, which the model warns about. Two dropped their gable vents, because a lower roof left no room for them. Each change passed the load checks and each saved money. Leaving out a part the design called for is not a saving, though, so gallery designs must now draw with no warnings at all.

## What the search keeps changing

Across the ten designs, the same few changes kept winning:

- **An OSB subfloor instead of plywood.** Chosen in all ten.
- **Studs at 24" on centre.** Chosen in every design with lap siding over sheathing. The one card with 3/8" LP SmartSide panels keeps 16", the spacing those panels are rated for.
- **A 4" overhang instead of 12".** Chosen wherever the card did not keep the overhang. Only the "best looking" card keeps a foot of overhang, because that is part of its look.
- **Birdsmouth seats instead of rafter connectors.** Chosen in seven of the ten. The other three kept connectors, under the 90% cap and the warning rule.

## None of them reaches $2,000

The owner's budget is about $2,000 in materials. The cheapest design in the gallery is the 8x8 at **$2,600.50**. The cheapest 8x12 (96 sq ft) is **$2,727.65** before tax, and only after the search swapped in LP SmartSide panels and a ridge board with ties. This is where that $2,727.65 goes:

| Section | Cost |
| --- | --- |
| Lumber | $688 |
| Siding | $510 |
| Roofing | $457 |
| Fasteners and sealants | $317 |
| Sheet goods | $154 |
| Paint | $150 |
| Wall trim | $140 |
| Roof trim | $99 |
| Foundation and hardware | $86 |
| Doors and windows | $52 |
| Door hardware | $39 |
| Site prep | $37 |

The surprise is fasteners and sealants: $317, more than the sheet goods. The 8x8 pays $313 for them, nearly as much as a shed half again its size, because nails, screws and caulk are bought by the box. Getting near $2,000 will take changes this search cannot make yet: buying fasteners by the pound, and lap siding that does not need OSB behind it. Lane 1 of this round is working on design-level search, and the gallery will take its designs when they land.

## Storage figures

Each card shows these figures, all measured inside the studs:

- the clear floor;
- the cubic feet under the roof (for a ridge board, this includes the triangle above the ties, usable as a loft);
- the length of wall with no door or window, for shelves;
- the widest door.

The "most storage" card is a 10x10 with an open ridge-beam roof at 9/12. It has 866 cu ft under the roof, against 743 for an 8x12 at 5/12, for $3,516.

The figures are screening numbers from the tool's own checks, not an engineer's review. Your town decides what needs a permit.
