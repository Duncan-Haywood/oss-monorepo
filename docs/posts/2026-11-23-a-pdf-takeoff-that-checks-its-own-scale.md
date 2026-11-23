---
title: "A free PDF takeoff that checks the scale against the drawing's own dimensions"
seo_title: "Free PDF takeoff that catches half-size prints"
date: 2026-11-23
tags: [construction, estimating, ventures, pdf]
description: "PDF plan takeoff reads each view's scale note, then checks it against the dimension strings. Shrunk to half size, 43 of 44 checked sheets were flagged."
---

Every quantity in a takeoff is a measured line times a scale. Get the scale wrong and every line of the estimate is wrong by the same factor, and nothing on the screen looks off.

There are two common ways it happens. One sheet holds several views at different scales, say a plan at 1/4" and a wall section at 1-1/2", and the measure tool keeps one scale for the whole page. Or the set is printed smaller than it was drawn. An 11x17 print of a 22x34 set still says `1/4" = 1'-0"` under every view, but every line on it is half as long. Measure that sheet at its printed scale and lengths come out half, areas a quarter.

The new [PDF plan takeoff](https://marisstella.app/pdf-plan-takeoff/) handles both. It is a free browser tool for lengths, areas and counts, and its clicks snap to the drawn line work. Nothing is uploaded.

## The drawing already says what scale it is at

A drafter writes `24' - 0"` above a dimension line that runs between two witness lines. Divide the written value by the line's length on the sheet and you get the scale the sheet is really at, whatever the note says. The tool does this for every feet-and-inches string it can match to a line, then compares the answers with the sheet's printed notes:

- **confirmed**: at least three dimensions agree with a note
- **half size**: they agree with twice a note's ratio. Measurements are valued at the corrected scale, and a switch puts the printed one back.
- **inferred**: no note, but the dimensions name a standard scale
- **mismatch**: the dimensions name a scale that no note gives

Two details mattered. Revit runs a dimension line a few points past its witness lines, so the span has to be measured from witness line to witness line, not end to end. Using the line ends put one sheet's dimensions anywhere from 47.1 to 48.1 when the note said 48; witness to witness, they all read 48.0. Revit also draws an opaque filled box behind each dimension's text, and the first matcher kept picking that box's edge as the dimension line.

## How it did on real sets

We ran it on 14 public drawing sets from open architecture projects, 180 mostly Revit pages. It read 397 scale notes on 142 pages and matched 1,385 dimension strings to a line. The dimensions settled the scale on 47 pages: 44 agreed with a printed note, and on 3 pages with no note they named one. The other 133 pages were 3D views, schedules and details with too few dimensions to say.

We had no real half-size prints, so we made some: the same 180 pages with every coordinate and text size halved. The tool flagged 43 of the 44 confirmed pages as half size, and none of the 180 originals. The one miss has a 1/4" plan and a 1/2" detail on one sheet. Shrink a 1/2" view to half size and it measures exactly like a 1/4" view, so its dimensions back the 1/4" note.

## What did not work

The tool also has an experimental fill: click inside a room and it fills the region the line work closes, ignoring curves so a door swing does not cut a quarter circle out of the room. On the sample plan's office, 12' x 10' clear, it gives 120.5 SF. On the real sets it failed. Revit prints each room's area in its tag, which gave 298 rooms to check against, and only 5 came within 2%. Those plans are exported as image tiles: the walls are pixels, door openings without a leaf leave a room open to the next, and vector dimension lines cut across the rooms. Leaving out the dimension pen's lines made things worse, because the rooms then leaked through their doorways. The README has the numbers. For now, trace rooms on sheets like these with the Area tool. Finding doorways in the line work, so a fill can close them, is the next job.

The code is MIT licensed and has no dependencies. `node cli.mjs set.pdf` prints the scale verdict for every page of a set, which is a quick way to check a bid set before anyone measures it. Like any measuring tool, it doesn't replace the written dimensions, which govern over anything scaled.
