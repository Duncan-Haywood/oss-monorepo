---
title: "What changed between two IFC revisions? GlobalIds lie 19% of the time"
seo_title: "Compare two IFC revisions: a free quantity change report"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now compares two model revisions. On five real Revit exports of one house, 190 of 1,011 GlobalId-only adds and removes were one element."
---

When an architect sends a new issue of a model, the estimator's question
isn't "what's in it" but "what changed since the last one, and what does it
cost". Paid tools like CostX and Cubit answer it. The free
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) can now
too: take off the new issue, drop the old one under "Compare with an earlier
revision", and you get the change on every bill-of-quantities line, priced
with your rates, plus a CSV of every element added, removed, changed, moved
or resized.

The obvious way to build this is to key on the IFC GlobalId, the 22-character
id every element carries, and diff two lists. We tried that first on real
files, and it misreports a lot.

## Five exports of one house

OpeningDesign, an architecture practice, works in public on GitHub. Its
Aalseth Residence repository holds five Revit IFC exports of one house,
committed over five days in November 2019 (CC BY-SA; we read them but don't
copy them into our repository). Between consecutive exports, a GlobalId-only
comparison lists 1,011 elements as added or removed. 190 of them (19%) are
the same building element:

- **Four doors, a window and a wall get new GlobalIds in every export.**
  Their Revit ElementId, which Revit writes into the IFC `Tag`, doesn't
  change, so the report matches them by Tag within a class when the Tag is
  unique in both files.
- **Floors, roofs and walls switch between a host and its parts.** Three of
  the exports were made with Revit "parts" on. A TJI floor then comes out as
  five layers named `Part:2638058` and so on, and in the next export it's one
  slab again. The layers' volumes sum to the slab's, 30.6818 m3 both ways.
  The report pairs a host with the parts whose centres fall inside its box,
  on the same storey, when the volumes agree within 2%. That last rule needs
  the slack: wall layers are trimmed differently at the corners and come out
  0.2 to 1.6% off their host. One more quirk: a roof's parts are exported as
  IfcRoof, the roof itself as IfcSlab, so the class can't be part of the test.

Without those two rules, the house's floors would appear to be demolished and
rebuilt in three of the four steps.

## Controls with a known answer

The opensourceBIM test files include three pairs from the HHS Office model
that differ by a single deliberate edit. The report finds exactly that edit
in each: a wall renamed under a new GlobalId, a column given a new id, and
nothing at all in a 3,964-element file that BIMserver rewrote from scratch.
The column pair hid a trap. Its "new" GlobalId is the floor slab's, so the
file carries one GlobalId twice, which IFC forbids. Our first version kept
the last row per GlobalId and only got this file right because the slab
happens to come later in it. It now pairs a repeated GlobalId with the
element of its own class and counts the repeats. A test puts them in the
other order.

## What the last commit changed

The last export's commit message says "updated IFC model, with updated
stair". The report agrees: the stair's flights, landing and stringers are
resized (Run 1 went from 1.81 x 0.99 x 1.24 m to 1.57 x 0.98 x 1.08 m),
joists are re-typed, and 18 elements moved 0.16 m together. "Moved" means
the box kept its size and shifted. A wall made longer is "resized" instead,
so it isn't reported as moved too.

## What we don't know

No estimator has read these reports yet, so "moved" and "resized" are our
guess at the categories a change order needs. Elements whose faceted body
keeps no faces have no box, and can only match by GlobalId or Tag. The 10 mm
and 2% tolerances were picked on one house. The method, the numbers and
the commands to rerun them are in
[eval/revision-diff-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/revision-diff-2026-11-20.md).
The page's "Compare two revisions of it" button runs the same report on a
hand-made sample whose every change is worked out by hand.
