---
title: "The dead sensel and its four diagonals: repairing a DNG's bad pixels before the demosaic"
seo_title: "DNG FixBadPixelsConstant and FixBadPixelsList, implemented and tested"
date: 2026-11-12
tags: [photo-editing, ventures]
description: "ShootFlow's DNG developer now runs the two bad-pixel opcodes. A dead sensel becomes the mean of its nearest same-colour neighbours, exact on a plane."
---

Every camera sensor has a few sensels that don't work. Some are stuck dark and some are stuck bright. Some go hot on long exposures. The camera usually knows which ones they are. A DNG file can carry that knowledge in its first opcode list, `OpcodeList1`, as one of two instructions:

- **FixBadPixelsConstant**: every sensel that holds exactly this value is bad. The camera writes, say, 0 into the dead ones and tells the reader so.
- **FixBadPixelsList**: here are the bad points, as row and column, and the bad rectangles. A dead column is just a rectangle one sensel wide.

Until today [ShootFlow](https://marisstella.app/photo-editing/)'s DNG developer named both of these in its report and did nothing with them. A dead sensel then went into the demosaic as a black dot. The demosaic spreads each sensel into its neighbours' missing colours, so that dot turns into a small coloured smudge.

## What a repair has to respect

A raw file isn't an image yet. Each sensel sees one colour through a Bayer filter: red, green or blue in a 2x2 pattern. So you can't average a bad sensel with the pixels right beside it. Its left and right neighbours are a different colour.

Inside a 2x2 Bayer pattern the nearest same-colour neighbours are:

- **for green**, the four diagonals, one step away. Greens sit on a chequerboard.
- **for red or blue**, the eight sensels two rows or two columns away, counting the diagonals at (±2, ±2).

The repair takes the mean of the nearest ring that still has a good sensel in it. If a neighbour is bad too, it's left out. If the whole ring is bad, as in the middle of a dead block, the search widens one step, up to eight. Each repair reads only original values, never another repair, so the order doesn't matter.

There's a neat check here. If the scene is a flat slope, any surface `a + b*row + c*col`, a symmetric ring averages to the exact value at its centre. So on a synthetic sloped image an isolated bad point, a dead column and a dead row all have to come back exactly, for all four Bayer phases. They do.

## The test that was wrong

The first version of the test put a dead column and a dead row in the same image. It failed by three units at one sensel. That sensel was blue, two rows above the dead row, so the bottom of its ring sat on the dead row and dropped out. The ring was lopsided and the slope didn't cancel.

The code was doing what it says. The test had assumed more than the algorithm promises. So the lines are now tested one at a time, and the crossings, corners and blocks are checked against a brute-force reference written in the test: sort every same-colour sensel by distance and average the nearest good ones. Code and reference agree exactly on a random image with corners, touching points and blocks.

## One guard, and what we haven't checked

FixBadPixelsConstant has a trap. If the constant is 0 and the frame is badly under-exposed, thousands of real sensels hold 0 too. "Repairing" them all would be slow and wrong. So a constant that would flag more than 1% of the frame isn't run, and the report says so. A real defect map is a few hundred or a few thousand sensels out of millions. On a 12 MP frame with 2,000 marked sensels the repair takes 0.15 seconds with numpy and 0.34 seconds without.

What we haven't checked is a real camera file. The two public camera DNGs this developer already matches against LibRaw, an LG Nexus 5X and a Leica T, carry no `OpcodeList1` at all. Adobe's SDK also uses its own interpolation weights, which we haven't copied, so an Adobe render can differ at the repaired sensels. A DNG whose writer marks defects is the next thing to find. The details are in the venture's [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/photo-editing#dead-and-hot-sensels-from-the-dng-fixbadpixelsconstant-and-fixbadpixelslist-2026-11-12) and `eval/bad-pixels-2026-11-12.md`.

ShootFlow is MIT-licensed and runs on your own machine. Its output is an estimate of what the file describes, not a guarantee that it matches any other raw converter.
