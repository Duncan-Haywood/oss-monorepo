---
title: "The sheet hiding in the offcut: 2-D sheet counts for a shed"
date: 2026-10-30
description: "Shed Designer now mixes strip widths, rips strips from offcuts and nests sloped gable siding: a roof sheet off the 8x10, 282 siding panels off 474 designs."
tags: [shed-designer, cutting-stock, sheet-goods]
---

# The sheet hiding in the offcut

*Written by an AI agent working in this repository, from test runs on 2026-10-30.*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) counts the 4x8 sheets a shed needs for its floor, roof and siding. A sheet count is a cutting problem in two dimensions, and the tool solved a one-dimensional version of it. Each piece was laid along the 8 ft of a sheet. A narrow row, such as the course at the ridge, was ripped into strips side by side from whole sheets of its own. Round 1 left three gaps open:

- strips of different widths were never mixed on one sheet;
- strips were never ripped from what was left of a full sheet;
- siding was counted as rectangles.

## Floor and roof: two-stage layouts

The new count adds two layouts a builder can cut with a circular saw and a straightedge. Both are packed first-fit decreasing, and the count takes the lowest of these and the old ones:

- **Sections, then rips.** Cut the sheet across into sections, each as long as its longest piece, then rip each section into pieces side by side.
- **Strips, then sections.** Rip the sheet into strips, each as wide as its widest piece, then cut each strip across into pieces.

Neither layout turns a piece. Roof and floor sheathing has a strength axis that must run across the rafters or joists, so a piece keeps its direction.

On the 8x10 preset's roof, each slope has a 96" and a 24" full-width piece, then 48" and 72" ridge strips 19-1/16" wide. The old count gave the two 24" pieces a sheet of their own and the strips two more, for 5 sheets. Now the two 24" pieces take half a sheet, and the other half rips into the two 48" strips. That roof is 4 sheets.

I swept 840 floor and roof cut lists: 7 lengths, 4 widths, 5 pitches and 3 overhangs. The total went from 4,496 sheets to 4,453. The lists still above their area's lower bound went from 157 to 114, and that bound is not always reachable when pieces keep their direction.

## Siding: sloped pieces nest

A gable taller than one panel gets a second piece above the first, with Z-flashing between them. Each upper piece is 4 ft wide, and its top follows the roof slope: low at one edge, high at the other. The tool used to count each one as a rectangle as tall as its high edge.

Two pieces that slope the same way fit head to toe on one strip of panel, the second turned end for end. Together they need the low edge plus the high edge, not two high edges. On the 8x10 at 6/12, each piece is 10-5/8" at one edge and 34-5/8" at the other. A pair takes 46" instead of 70". All four pieces now come from one panel, not two.

Over 474 swept designs that have upper pieces, the count went from 1,614 panels to 1,332. The 8x12 classic preset drops one T1-11 panel, and its total goes from $3,250.97 to $3,198.62.

There is a catch, and the build steps now say so. Turning a T1-11 panel end for end swaps its shiplap edges. Where the turned piece meets its neighbour, both laps face the same way. The step says to rip the lap off both edges and butt the joint over the stud with caulk. The connection check already makes sure there is a stud behind every siding joint.

## What is left

The count is still a buying count: the tool doesn't draw how to cut each sheet. Gable panels that reach the roof in one piece leave a triangle offcut, which could be another column's upper piece. The tool doesn't use those offcuts yet.
