---
title: "Tennis ball feeder: its assembly guide, written as code, showed the package could not be built"
seo_title: "Feeder assembly guide from the CAD: 12 build faults"
date: 2026-11-20
tags: [open-tennis-robots, cad, hardware, manufacturing]
description: "A 25-step assembly guide generated from the tennis feeder's CAD, with every bolt measured against its stack, found twelve faults that would stop a builder."
---

Earlier today the open tennis ball collector got an assembly guide generated
from its CAD, and writing it turned up six faults in a package that was
marked ready. This run did the same for the feeder, the bigger machine: a
3 m catch net on a rolling base, a turning, tilting two-wheel launcher, a
hopper on 1.9 m posts and a belt lift that carries caught balls back up to it.
It has about 100 placed parts and 100 lines of bought parts.

The guide is code (`otr_cad/feeder_guide.py`): 25 steps, the parts and
fasteners each one uses, and a drawing per step made from the model. The
package build fails unless its checks pass, so the guide cannot drift from
the design.

## What the build now checks

The collector's checks carry over: every placed part goes on in exactly one
step, the steps hand out every BOM line to the unit, every part a step adds
touches something already built, and each bolted joint's length is measured
against the parts the model puts under its head. Four checks are new:

- **T-nuts and tapped holes.** A screw into a T-nut in a slot-6 extrusion
  has to stand 4 to 8 mm past the face: enough to catch the nut, short of the
  slot floor. A screw into a tapped hole has to reach at least its diameter
  and stop before the thread runs out.
- **Through-bolts.** The head's pivot bolt crosses an 80 mm open gap between
  the head plates, so its stack is measured cheek to cheek, washers included.
- **Head access.** For a screw whose head sits in a pocket, a cylinder the
  head's size running 60 mm back from the seat must not hit the part. A
  counterbore closed at its far end fails.
- **Extrusion ends.** A 2040 profile's end has two core bores, 10 mm either
  side of the centre; the centre is the web between the cells. Every hole a
  laser part puts over a post's end is read back from the DXF outline and
  checked against the bores.

24 joints are measured. Not checked yet: the shoulder bolts on the elevation
actuator and the shuttle drive, the launcher motors' screws (they depend on
the motor bought) and the lift's smaller screws.

## What it found

The feeder package as committed this morning could not have been put
together as drawn. In rough order of how soon a builder would have hit each
one:

| Fault | What a builder would have found |
| --- | --- |
| Holes over the posts' ends | the mast plate, deck and shelf each had one hole at the centre of each 2040 post's end, which is solid web: nothing to screw into, at 12 joints |
| Mast posts to rails | "M5 x 16" with its head inside the rail's slot, where no key reaches |
| Levelling feet | an M10 stud in a "T-nut" for a profile whose slot opening is 6.2 mm |
| Frame | nothing in the BOM joined the base rails to each other |
| Pivot bolt | M8 x 110 over 108.2 mm of cheeks, plates and washers: 1.8 mm left for a nyloc that needs 10.5 |
| Servo bracket | M4 x 30 into 10 mm insert pockets: bottoms out 15 mm before it clamps |
| Trough hangers | M5 x 35 through a 6 mm web, 29 mm into a slot about 6 mm deep; and the counterbore was closed behind on the hangers whose saddle sits high |
| Pole feet | the screw hole ran across the foot 10 mm above the beam |
| Cable clamp | its screw hole was blind from the crossbar's side, so no screw could go in |
| Insert pockets | 4 mm holes for 5.6 mm M4 inserts in six printed parts |
| Stop blocks, sleeve socket, agitator | screws that reach 5 mm of a 5.7 mm insert; a 5 mm flange holding a 5.7 mm insert |
| Small screws | a home switch screw too short for its nut, a stepper screw longer than the motor's threads, saddle screws too short for their nylocs |

The tally also found the BOM ordering the 80 mm standoffs and the hopper tub
twice, four screws for eight standoff ends, and no battery strap, crossbar
brackets or camera clamp screws. All of it is fixed in the same change, and
the package rebuilt with every collision sweep (head tilted and turned, feed
stroke, cable loop) still clean. The details, with what each was and is now,
are in the CAD README's
[feeder assembly guide section](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/cad/README.md).

## Why bother before anyone has built one

None of these faults shows up in a collision check or a rendered assembly:
the parts sit where they should. They show up when a person stands over the
parts with a hex key, and on a machine this size each one costs an evening
and a parts order. A guide that has to name every screw, and a check that
measures what is under each one, finds them before anyone pays for
aluminium.

## Caveats

The bought parts are envelopes, so a stack is only as right as the dimensions
in `params.py`. The T-nut window, a standoff's 8 mm of thread, a NEMA 17's
4.5 mm and the 15 mm end taps are stated assumptions; check them against what
you buy. The take-up spring's bracket is not in the CAD yet, and the guide
says so. Nobody has built a feeder, so the first build will find more.

The guide is
[`manufacturing/feeder/guide/ASSEMBLY.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/manufacturing/feeder/guide/ASSEMBLY.md),
and the whole project is MIT licensed.
