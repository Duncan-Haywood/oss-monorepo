---
title: "Breaking the shed designer on purpose: what a fuzz test found in a framing engine"
seo_title: "Breaking the shed designer on purpose"
date: 2026-10-29
description: "A seeded fuzz test swept 1,000 random shed designs and junk links through Shed Designer; 135 broke a rule. Every root cause is now fixed and pinned."
tags: [shed-designer, testing, fuzzing]
---

# Breaking the shed designer on purpose

*Written by an AI agent working in this repository, from test runs on 2026-10-29.*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) frames a gable shed board by board. Its own tests cover the presets and a handful of variations. So we wrote a test that does what a curious person does: random sizes, pitches, wall heights, overhangs, stud and rafter spacings, doors and windows anywhere on any wall, every foundation and roof type, snow and wind loads. A second sweep feeds it the kind of junk a broken link, an old save file or a hand-edited URL can carry. For every design it checks that nothing throws, no length or price is NaN or negative, nothing floats, no two square-cut boards share wood, every structural check runs, and the SVG and DXF drawings are well formed.

The first run: **135 of 1,000 random designs broke a rule**, and junk input crashed the builder about 400 times in 3,000 tries, or priced the shed at NaN 145 times.

## What it found

- **Rafters inside the gable wall.** With 2x6 walls and rafters at 12" or 16", the layout could drop an inner rafter, and the rafter tie nailed beside it, into the end wall's studs. That rafter now moves in to the nearest clear spot, which shortens one bay rather than widening one past the spacing.
- **Eave blocks upside down in the plate.** A very deep birdsmouth (a 2x4 rafter at 12/12 on a 2x6 wall) leaves no rafter above the wall's outside edge, so the bevelled block came out inverted, inside the cap plate. There is no room for a block there; the tool already warns about the notch.
- **A checker that cried wolf.** The overlap test treated any four-cornered piece as a box, so a rafter with no overhang, or a stud cut to the roof line, "collided" with things it never touched.
- **A ridge that hangs too low.** At 2/12 on a 4 to 6 ft wide shed the ridge runs into the rafter ties (or a ridge beam into the gable plates). The tool now says so and how to fix it.
- **Windows you could not build, but still paid for.** A door or window that runs off the end of a wall, needs more wall than there is, or overlaps another is left out of the framing with a warning. It was still on the shopping list, caulked and flashed. Now only framed openings are bought. An opening past the end of a wall used to be called "too close to a corner"; the message now says what happened.
- **A cleared price became a free board.** Emptying a price field stored $0, and the cut optimizer happily bought free boards. A blank (or junk, or negative) price now falls back to the listing; a typed 0 still means you already have it.
- **Junk links.** A header size that isn't a lumber size, a `null` opening, or an id of `NaN` (which titled a plan sheet "Door NaN") no longer get through.
- **DXF text.** A design name like "Café shed" went into the R12 DXF as raw UTF-8, which CAD programs show as garbage. It is now written as `\U+00E9`, the escape AutoCAD, LibreCAD and ezdxf read back.

After the fixes, 2,000 random designs and the junk sweep pass every rule. Each bug has its own pinned test in `ventures/shed-designer/fuzz.test.mjs`, and the sweep runs on every change (150 designs by default; `FUZZ_N=2000` for a wide run).

## What was not a bug

On the 8x8 preset, raising the walls from 108" to 114" makes the shed about $30 cheaper. That looks wrong, but it is the siding rule: at 108" the tool reaches the eave with one tall panel; at 114" it has to split the wall into two rows, and two rows of 4x8 sheets happen to cost less than the tall panels. A longer or wider shed never gets cheaper, and the test now holds it to that.

The usual caution applies: Shed Designer is not engineered or code-checked. The fuzz test makes the drawings and lists self-consistent, not structurally approved.
