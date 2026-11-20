---
title: "Tennis ball collector: writing its assembly guide from the CAD found six faults a builder would have hit"
seo_title: "Assembly guide from the CAD: six faults found"
date: 2026-11-20
tags: [open-tennis-robots, cad, hardware, manufacturing]
description: "Generating a step-by-step assembly guide from the collector's CAD, with every bolt checked against its stack, found six fit faults in a package marked ready."
---

The open tennis ball collector has had a "ready to manufacture" package for
weeks: laser DXFs, printable STLs, STEP files, a bill of materials, all
generated from one parametric model. Its build already checked every part
against every other for collisions and every printed part's holes against
the base plate. What it did not have was an assembly guide. The project
roadmap listed one as item 9.

So this run wrote it, and wrote it as code: `otr_cad/guide.py` lists the
14 steps, which parts and fasteners each one uses, and draws each step from
the model (new parts in black over what is already built in grey). The
guide is generated with the package, so it changes when the design does.

## Checks that come with the guide

A guide in code can be checked, so the build now fails unless all of these
hold:

- **Every bolt's length against its stack.** For each bolted joint, a thin
  ring around the bolt's axis is intersected with the placed parts to
  measure what sits under the head. A nyloc nut needs its own height plus
  two threads past the stack. A screw into a heat-set insert must reach the
  insert's full 5.7 mm without bottoming out. A shoulder bolt must be 0 to
  1 mm longer than the parts that swing on it.
- **Tally.** Every placed part goes on in exactly one step, and the steps
  use every bought line of the BOM, to the unit.
- **Order.** Each part a step adds touches something already built.
- **The emptying hatch comes off.** With the drum hung on its arms, the
  hatch can be lifted out and slid away without hitting anything.

## What it found

Measuring each joint in the model, to write the step that fastens it, turned
up six faults the collision check could not see. They were fixed before the
checks went in, and the tests confirm the checks fail on the old values:

| Fault in the committed package | Fix |
| --- | --- |
| Every heat-set insert hole was a 4.0-4.4 mm pilot. M4 inserts want about 5.6 mm. | 5.6 x 6.5 mm pockets, with screw clearance past them |
| The mast socket's bolts and the caster adapter's bolts shared one patch of the base plate, each set's heads under the other part | One set of four M4 x 20 from below through the adapter and the plate into the socket's inserts |
| The motor clamp's cap bolts left 1.1 mm of plastic to the motor bore (0.5 mm once an insert went in) | A wider clamp with the bolts moved out: 4 mm of wall |
| The yoke pivot's "M8 x 25" shoulder bolt had to pass through a 5 mm arm and a 30 mm block | An 8 mm x 40 mm shoulder bolt, and a block sized so the arm swings with 0.5 mm of float |
| At the drum axle, a washer stack bore on the turning end cover and nothing clamped the bearing's inner race | An M8 x 30 bolt clamping the arm, a 12 mm spacer through the cover and the inner race |
| The axle passed through the emptying hatch, so emptying the drum meant taking it off its arms | A slot from the axle to the rim, and 1 mm more arm gap: turn the drum slot-down, undo six thumb screws, lift the hatch out |

Three smaller ones came with them. The clamp-ring screws were M4 x 12 with
nylocs over an 8 mm stack, and are now M4 x 16. The disc holes for M5 rivet
nuts were 5.5 mm and are now 7 mm. The tray standoffs' screws reached only
3 mm into the standoff from below and are now M3 x 10.

None of these is subtle once you hold the parts. But the package passed every
check it had, because those checks asked whether parts overlap, not whether
someone can put them together. A collision check is happy with a 25 mm bolt
in a 35 mm hole; it never draws the bolt.

## What is still open

The guide has not been followed by anyone building one. The stack check is only
as good as the envelope dimensions of the bought parts (nut heights from DIN
985; a rivet nut's flange taken as 1 mm). The two microswitches that sense the
drum lifting over an obstacle still have no mount in the CAD, and the guide
says so. The feeder, a much larger machine, gets the same treatment next.

The guide is at
[`manufacturing/collector/guide/ASSEMBLY.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/manufacturing/collector/guide/ASSEMBLY.md),
and the method is in `cad/README.md`, "Assembly guide". Everything is MIT
licensed. This is a design, not engineering advice: check bought parts against
their datasheets before cutting metal, and read `hardware/safety.md` before
powering anything.
