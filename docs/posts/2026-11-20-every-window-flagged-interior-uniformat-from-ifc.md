---
title: "Every window flagged interior: sorting IFC models into Uniformat II"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures, construction]
description: "Our IFC takeoff now groups a bill of quantities by Uniformat II element. On 17 public models the rules match 482 of 588 author-set codes."
---

An estimator doesn't price a building by IFC class. They price it by
element: foundations, exterior walls, partitions, roof coverings, plumbing
fixtures. In the US the usual way to lay that out is UNIFORMAT II, and NIST
published its codes as a public-domain report (NISTIR 6389). A model doesn't
know any of that. It knows that a thing is an `IfcWall` with a type name, a
storey and maybe a flag that says `IsExternal`.

The [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
now closes that gap. Pick "Uniformat II element" under *Group by* (or pass
`--by uniformat` to the command line) and the bill of quantities comes out as
an elemental estimate: `B2010 Exterior Walls`, `C1010 Partitions`,
`D2010 Plumbing Fixtures`, each line with its count, volume, area and length,
priced at your rates if you enter them.

## Where the code comes from

If the model already carries a Uniformat code, that code wins. Revit writes
its *Assembly Code* as a classification reference (`B2020100` under
`csiorg.net/uniformat`) or as a property. We cut it to level 3 and check it
against the table. That check is needed: one Norwegian school model keeps
fire ratings like `E30` in its "Default Classification", and `E30` reads like
a Uniformat code until you notice there is no such element.

If the model has no code, a rule reads the class along with what the model
says about the element: its PredefinedType (a slab can be `BASESLAB`, `ROOF`
or `LANDING`), IsExternal, the wall a door fills, the assembly it belongs to,
and whether its storey is below grade. When a rule can't get to level 3, it
stops early and says so. A beam can't tell whether it holds up a floor or the
roof, so it goes to `B10 Superstructure (not told further)`. A pipe whose
system we don't read goes to `D Services`. Anything the rules can't place at
all lands under "no Uniformat element", with the reason, and is never given a
guessed code. The element CSV lists every element's code, where it came from,
and why.

## What the real models taught us

We ran the rules on 17 public models (33,893 elements). 588 of those elements
carry a code their author set by hand, so we could score the rules against
them. On the first pass the score was poor: 15 of 166 comparable elements
matched at level 3. Two causes accounted for most of the misses.

**Every window in one house was flagged interior.** In Schultz Residence, a
Revit export, all 25 windows have `IsExternal = false`, and so do the walls
they sit in. The author's own Assembly Code puts those same windows in B2020
Exterior Windows. So we no longer trust the flag on windows. A window counts
as exterior unless it sits in a roof, in which case it's a roof opening
(B3020).

**Grab bars count as plumbing in IFC.** Revit exports towel dispensers, grab
bars and mirrors as `IfcSanitaryTerminal`. The class rule therefore filed
them under D2010 Plumbing Fixtures. Their authors filed them under C1030
Fittings, which is where NISTIR 6389 puts toilet accessories. A short list of
family-name words now sorts those out, and it applies only to the generic
classes where the class says little.

After those fixes, the rules agree with 525 of the 588 author-set codes at
level 1 and 482 at level 3. On dental_clinic, the model we held back until
the rules were done, 66 of 69 matched. Most of what's left is the author's
judgement. One school files lockers as equipment, while NISTIR puts them
under fittings. One house names its cabinets by catalogue number, and
nothing in the file can tell casework from furniture.

## What this doesn't show

None of the 17 models puts an author's code on a wall, slab or beam, and
those elements carry most of the money in a building. So the wall and slab
rules are checked against the IFC definitions and our hand-made sample, not
against an estimator. Those rules also trust IsExternal, even though one
house shows an exporter can get it wrong. The next step is to decide whether
a wall is on the outside from the geometry itself, so the flag isn't needed.

The full method, numbers and misses are in
[eval/uniformat-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/uniformat-2026-11-20.md).
The tool is free, MIT licensed, and runs in your browser. Your model is never
uploaded.
