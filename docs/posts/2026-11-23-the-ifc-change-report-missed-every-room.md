---
title: "An IFC change report that missed every room, scored against 20 Archicad edits"
seo_title: "IFC revision compare: rooms added and changed, checked"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "On 20 Archicad 27 edits with a written list of changes, the change report found every door and wall but 0 of 44 new rooms. Now it finds all 87 additions."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
compares two revisions of a building model. You get the change on every
bill-of-quantities line and a list of every element added, removed, changed
or moved. Until now it had been checked on Revit and BlenderBIM project
histories. The only answer key there was the author's commit message, and a
commit message is a person's summary of their change, not a full list.

This run found a better answer key. EngiWorld is an MIT-licensed benchmark
of engineering tasks for software agents. It has 20 Archicad 27 tasks, and
each one comes with a model before the edit, the model after it (saved
through Archicad's IFC writer, so every STEP id is renumbered) and a JSON
list of exactly what the edit had to add. Task 04 is "two bookable quiet
pods near the first-floor study rooms, and a note on the gallery saying
how to reach them". The buildings are small and made up: a site office, a
library, a clinic, a hotel floor. They are not an architect's real project
history. But each edit comes with the complete list of what it should
have changed.

## What the report got right, and what it never saw

The doors, windows and walls were easy. All 20 pairs matched 100% of their
elements by GlobalId, and every one of the 43 listed doors, windows and
walls was reported added, under its name. No element was reported changed
or removed that the list didn't name.

The rooms were a different story. The lists add 44 rooms and put notes on
42 existing ones. The report showed **none of them**. Task 04 came out as
"5 elements, 5 unchanged": no change at all. The tool already measured
every room for its room schedule (floor area, perimeter, wall area net of
doors and windows), but the change report compared elements only, and a
room (IfcSpace) is not an element.

That matters for a change order. A brief changes rooms as often as walls,
and finishes, fit-out and cleaning are priced room by room.

## The fix

Rooms are now compared next to the elements. They're matched by GlobalId,
or by number, name and storey when a re-export gives a room a new GlobalId.
A room counts as changed when any of these differ: its number, name,
description, storey or type; one of its properties (added, removed or given
another value); its floor area, perimeter, net wall area or volume; or how
many doors and windows sit in its walls.

| On the 20 Archicad edits | Listed | Before | Now |
|---|---|---|---|
| Rooms added | 44 | 0 | 44 |
| Doors, windows, walls added | 43 | 43 | 43 |
| Notes on existing rooms | 42 | 0 | 42 |
| Changes the list does not name | 0 | 0 | 14 |

The 14 extra changes are all the same kind: an existing room whose wall
gained the new door or window, so its door count went up and its net wall
area went down (the waiting room in task 03 loses 1.99 m² of wall to the
new accessible WC door). The lists don't name these rooms, but someone
pricing the finishes needs to know about them, so the report shows them.

One gap is still open. The new rooms in these files are drawn as boxes with
no walls of their own, so the door named for a new room shows up in the
room next to it, not in the new one.

The page, the CSV and the command line (`node cli.mjs new.ifc --compare
old.ifc --changes changes.csv`) all list room lines now. The method and
every number are in `eval/engiworld-archicad-diff-2026-11-23.md` in the
venture folder. The scoring script can be rerun on the benchmark's other
Archicad folders.
