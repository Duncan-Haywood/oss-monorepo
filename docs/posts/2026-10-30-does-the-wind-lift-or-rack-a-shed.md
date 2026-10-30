---
title: "Will the wind lift the roof or rack the walls of a shed?"
date: 2026-10-30
tags: [shed-designer, wind, structure]
description: "The shed designer now checks rafter ties for uplift and walls for racking. The ties have room to spare; a 4 ft door centred in an 8 ft gable end does not."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) already checked rafters, headers and studs under wind and snow. It took two wind paths on trust: the metal tie that holds each rafter down to the wall, and the siding panels that keep the walls from racking into a parallelogram. Both are now checked, against published values.

**Uplift at the rafter ties.** Each rafter end gets one tie:

- a Simpson H2.5A hurricane tie on a notched (birdsmouth) seat;
- a Simpson VPA2 variable-pitch connector on a connector seat.

Simpson's 2024 catalog gives their allowable uplift in spruce-pine-fir framing as 615 lb and 220 lb. The uplift on a tie is ASCE 7's allowable-stress combination 0.6D + 0.6W:

- the wind pressure you set, acting up on the rafter's strip of roof and again under the overhang;
- less 0.6 of the roof's own weight.

At 20 psf:

| Design | Tie | Net uplift a tie | Holds to |
|---|---|---|---|
| Starter 8x12 | VPA2 | 25 lb | 72 psf |
| 8x12 classic | H2.5A | 43 lb | 99 psf |
| 10x12 | H2.5A | 47 lb | 87 psf |
| 12x16 | H2.5A | 56 lb | 78 psf |

The ties have room to spare. The "holds to" column is there because the tool takes one wind pressure for the whole shed. ASCE 7 gives higher pressures near roof edges and corners, so compare your local figure with it, not with 20.

**Racking.** Wind on the long side of a shed has to reach the ground through the two short walls, and the siding nailed to their studs is what stops them folding over. The check uses the shear-wall values in AWC's SDPWS (2015, Table 4.3A):

- T1-11 is plywood siding: 450 plf at 6" nailing. Halved for allowable stress and reduced for spruce-pine-fir studs, that is 207 plf.
- Lap siding over 7/16" OSB counts as OSB sheathing: 308 plf.
- Only full-height panels count. A panel narrower than the wall's height divided by 3.5 counts for nothing, and one between h/2 and h/3.5 counts for less.

The presets come out at 23% to 58%. The weak spot is a door in a short wall. Put a 4 ft door in the middle of an 8 ft gable end and it leaves two 24" panels on a 96" wall, a 4:1 ratio, so that wall braces nothing. The other gable wall can take the whole load only if the roof can carry the twist to the long walls. SDPWS allows that for a one-storey open front no deeper than it is wide (1:1). An 8x8 qualifies. An 8x10 or 8x12 with that door does not, and the check fails it.

Of 24 door variations we tried on the gable ends of the presets, 7 failed this way. The fixes:

- a narrower door;
- a full-height braced panel beside it;
- the door on a long wall;
- an engineered portal frame or hold-downs (the tool does not model these).

**What is still not checked.** The hold-downs at the ends of each braced panel, and anything tying the shed to the ground. A shed on blocks is held down by its weight alone, which is a separate question and the next check worth writing.

All of this is screening with stated assumptions, not an engineer's review, and the plans are not engineered or code-checked.
