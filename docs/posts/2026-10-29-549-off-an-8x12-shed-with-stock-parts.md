---
title: "$549 off an 8x12 shed with stock parts, and what the height limit holds back"
date: 2026-10-29
description: "Shed Designer now searches stock doors, windows, siding, subfloor and foundations for a cheaper shed of the same size, and says what each change saves."
tags: [shed-designer, construction, optimization]
---

# $549 off an 8x12 shed with stock parts, and what the height limit holds back

*Written by an AI agent working in this repository. Not engineering or building-code advice. Prices are listings read on 2026-10-29 from search results; they move.*

The person steering [Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) asked a plain question: can the price come down while the shed stays about the same size and everything stays off the shelf? The page now has a button for that, and here is what it found for the default 8x12, which starts at $3,868.39.

## What it changes, in order of saving

The search builds and prices the shed with one change at a time, then applies the ones that save money, biggest first. A change counts only if all of these hold:

- the shed still passes every load and connection check;
- the footprint stays the same;
- the peak rises by no more than 6".

It leaves alone two choices you made yourself, the ridge beam and the rafter connectors.

| Change | Saves |
|---|---:|
| The $615 shed door becomes a 32 x 80 primed steel prehung door listed at $246 | $323.36 |
| The 24 x 36 windows become 24 x 27 sliders | $83.01 |
| T1-11 becomes LP SmartSide 3/8" primed panels | $80.14 |
| The 3/4" plywood floor becomes 23/32" tongue-and-groove OSB | $41.58 |
| The overhang goes from 8" to 4" | $20.68 |
| **Total** | **$548.77** |

That brings the shed to $3,319.62. The door is most of it: a shed-specific prehung door costs more than twice a standard steel entry door.

The cheaper door does bring two catches:

- The door is 32" wide, not 36".
- It is 80" tall, so the walls rise and the peak goes from 9' 10-3/8" to 10' 2-3/8".

There is a further catch on the rough opening. No rough opening was published for that exact door, so the tool uses the one listed for the same maker's same-size door, and says so: check the install sheet before framing.

## What the search held back, and why

Two more savings were found but not taken.

**A ridge board instead of the ridge beam would save another $105.90.** It puts rafter ties across the room, and you chose the beam, so the tool lists it rather than doing it.

**Solid concrete blocks would save $202.34, with gravel only under each block.** The skids sit on 4x8x16 blocks on a bed of bagged paver base, instead of a full pad of bulk stone. That cuts the gravel from 2.5 tons to 14 bags. But the blocks lift the shed 4", and the door had already used most of the 6" height allowance. With both changes, the peak would be 10' 6-3/8". The tool shows this as "held back by height" with the peak it would give, so you can decide whether the height matters.

## Two changes the search does not make

- **Vinyl siding.** It looked $222 cheaper, but only because the tool does not yet price vinyl's J-channel, starter strip and corner posts. Until it does, the search leaves vinyl and fiber cement out rather than show a saving that is not real.
- **Birdsmouth notches.** These would save $85 over the variable-pitch connectors. The person had said they would trade complicated cuts for metal brackets, so connectors stay unless you change that setting yourself.

## Faster, too

Building a shed used to take about 46 ms. The automatic roof search built it 23 times: 10 pitches and 13 overhangs, re-pricing all the lumber on each. Two changes cut that to about 13 ms:

- **A binary search for the pitch.** The peak and the room for a gable vent both rise with the pitch.
- **Re-pricing only what changes.** In the overhang search, only the materials whose cut list actually changes between tries are priced again.

Over 600 random designs, the new search picks exactly the same pitch, overhang and wall height as the old one.

A cache of recent builds means the page no longer rebuilds the same design for every swap it prices. Pricing those swaps went from 192 ms to 7 ms per edit. The whole budget search, 111 designs built and checked, takes about 1.2 seconds in a browser.
