---
title: "A renamed room is not a new room: matching rooms split, merged and renamed between IFC revisions"
seo_title: "IFC revision compare: rooms renamed, split and merged"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ventures]
description: "On 45 Archicad and Revit edits, rooms that were renamed or split came out as removed and added. Now 63 such lines are down to 7, each checked against its brief."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
compares two revisions of a building model and lists what changed: every
element, and since yesterday every room. Yesterday's check showed the
report finding all 44 rooms that 20 Archicad edits had to add. Today's
check is about the rooms an edit keeps but changes.

## The problem

A room in an IFC file (an IfcSpace) has a GlobalId, the ID that is meant
to survive between saves. The report matches rooms by that ID first, then
by number and name. Real edits break both at once:

- **A rename on a re-export.** Archicad can re-create a zone, so it gets a
  new GlobalId, and the brief renames it in the same step. The room comes
  out as "UNCLASSIFIED removed, OFFICE added". The box and the 25.31 m² of
  floor are exactly the same.
- **A split.** A new partition turns OPEN STUDIO (29.06 m²) into STUDIO and
  MEETING (14.06 m² each). The report showed one room removed and two
  added.
- **A carve.** Revit keeps the old room's GlobalId for the part that keeps
  its number. Ground Lab went from 66.64 to 47.60 m², and the new prep room
  of 19.04 m² was listed as a plain addition.

An estimator pricing a change order needs the opposite view. It is the
same floor with a new partition, a door and finishes on two rooms instead
of one. "Removed" and "added" hide that.

## The data

[EngiWorld](https://github.com/Hongcheng-Gao/EngiWorld) is an MIT-licensed
benchmark of engineering tasks for software agents. Three of its folders
hold before-and-after models with a written brief:

- **15 Archicad "gui" tasks.** The ground truth was written by
  IfcOpenShell, and every GlobalId is regenerated.
- **10 Archicad stages.** Each one sends a model through Archicad's IFC
  writer.
- **10 Revit-then-Archicad chains.** Revit splits or renames rooms, then
  Archicad loads Revit's file and saves it again with no stated change.

The buildings are small and made up. The briefs say exactly which rooms
were renamed, split or merged, so they can be used as an answer key.

## Three rules

Each rule works within one storey:

1. **Same place, new name.** Two rooms are matched when their boxes overlap
   by 90% and their floor areas agree within 5%, with exactly one candidate
   either way. The change is listed as a rename.
2. **Split or merged.** One room is linked to several on the other side
   when their centres fall inside its outline and their areas add up to
   85–102% of its own. Below 100% is normal, because the new wall takes
   some floor.
3. **Carved.** Some added rooms sit in floor that a kept room lost. They
   are linked to that room when their areas add up to 85–102% of what it
   lost.

## Result

Rooms listed only as "removed" or "added", with nothing saying where they
came from:

| Edits | Before | After |
|---|---|---|
| 15 Archicad gui tasks | 29 | 7 |
| 10 Archicad stages | 1 | 0 |
| 10 Revit stages | 33 | 0 |
| 10 Archicad round trips of Revit files | 0 | 0 |

Every match agreed with its brief. Two examples: Revit's Activity Room
split into COMMUNITY-ACTIVITY and QUIET-COUNSELLING with 51.04 m² on both
sides, and two carved rooms whose areas equal, to the hundredth, the floor
their parent room lost.

The 7 left were read one at a time:

- **One full redraw.** A dental clinic conversion moved every wall. No room
  sits clearly inside the old exam room, so the report claims no split.
- **Two rooms drawn in new floor.** No existing room lost the floor they
  sit on.
- **One file that contradicts its brief.** It puts the "upper room" on the
  ground floor. The report reads that file correctly.

The round trip was the cleanest result. Archicad 27 loaded ten Revit 2025
files and saved them again, and all 114 elements and 32 rooms came back
with no change the report measures.

## Try it

Open the [takeoff page](https://marisstella.app/ifc-quantity-takeoff/),
drop the later revision, then the earlier one under "Compare". The change
list now has "Room split", "Rooms merged" and "carved from" lines, and the
changes CSV has the same rows. Everything runs in your browser, and the
file never leaves your machine. The script and the full numbers are in
[`eval/engiworld-gui-cross-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/engiworld-gui-cross-2026-11-24.md).
Quantities are estimates read from the model. Check them before pricing.
