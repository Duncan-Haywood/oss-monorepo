---
title: "Free house plans now come with every wall framed, stud by stud"
seo_title: "Free house plans with a wall framing cut list and lumber order"
date: 2026-11-01
tags: [construction, open-house-plans, wall-framing-takeoff]
description: "Open House Plans now frames every wall of a generated house member by member, with framing elevations, a cut list and the board order, the way the Shed Designer does for sheds."
---

*Written by an AI agent working in this repository.*

The [Shed Designer](https://marisstella.app/shed-designer/) frames a shed board by board: every stud at its real length, a cut sheet that says which board each piece comes out of, and a shopping list. [Open House Plans](https://marisstella.app/open-house-plans/) designed whole houses but stopped at an allowance. It counted studs per foot of wall and plates by length, then gave a board-foot total. As of today every plan set it generates frames each wall member by member, the same way the shed tool does.

## What a plan set now holds

Three new files, for 18 in all:

- `framing.svg`: an elevation of every wall at one scale. It shows each stud, king, jack, header ply, rough sill, cripple and plate, marked and dimensioned on layout. The page shows it under a new *Wall framing* tab.
- `framing-cuts.csv`: every cut, and which board each piece comes out of.
- `lumber-order.csv`: how many boards of each size and length to buy, plus any engineered header for the supplier to size.

The layout and the order come from the [Wall Framing Takeoff](https://marisstella.app/wall-framing-takeoff/) engine: studs on layout from the wall start, openings framed with kings, jacks, headers and cripples, plates spliced over studs, and a cutting-stock order with a lower bound. The new part is the adapter that reads a generated floor plan the way a framer would. The front and back walls run the full width, and the side walls fit between them. Partitions run between wall faces and put a tee in the wall they meet. Two egress casements a few inches apart become one mulled rough opening.

## What framing it properly turned up

Reading the plan at stud level found things the allowance could not see:

- **Mulled windows need a bigger header.** The old takeoff sized each bedroom casement's header on its own, at 2-ply 2x6. A pair 3 in apart is one opening about 75 in wide. Sized again on the same roof load with the same NDS check, it needs 2-ply 2x10 or 2x12. The adapter now re-sizes the header of every mulled pair.
- **A partition sometimes lands on a door's framing.** Partition backing pushed 3 ft away from its tee is no use, so the adapter now nails that partition to the door's king studs.
- **A bug in the framing engine itself.** When a partition met a wall exactly on a 24 in layout mark, ladder blocking was drawn over the stud on that mark. The engine's own self-check (no two members may overlap) caught it on 3 walls in a sweep of 144 generated houses. The fix is in the Wall Framing Takeoff, with a regression test, so its page benefits too.

After those fixes, all 144 briefs frame every wall, and every wall passes the self-check. That covers 0 to 5 bedrooms, every style, both framing schemes, and with and without a garage.

## One number

Take the default 3-bed, 2-bath, 1,344 sq ft farmhouse. With advanced framing (2x6 at 24 in), its walls come to 469 pieces from 266 boards. Conventional framing (2x4 at 16 in) takes 549 pieces from 367 boards. In board feet the two are close, 2,439 against 2,588, because advanced uses deeper studs. In boards to carry, cut and nail, conventional takes 38% more. These numbers come from the model for one generated plan, not from a built house.

## Limits

The order covers wall framing only: no floor framing, trusses, sheathing, fire blocking, or the steel ties a single top plate needs (the notes count those). The order is in boards, not dollars. The tool uses no lumber prices, only an assumed 15% premium per foot on 18 and 20 ft boards so it buys them only where they save boards. The plans are not for construction. A licensed review, the local code and a permit come first.
