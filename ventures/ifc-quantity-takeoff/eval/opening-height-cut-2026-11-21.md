# Doors and windows cut at the room's floor and ceiling, 12 public IFC models, 2026-11-21

**Question.** The net wall finish per room (eval/net-wall-finish-2026-11-21.md)
takes each door and window off at its full stored size. But the gross figure
it comes off is perimeter x the room's own height: a room whose solid stops at
a lowered ceiling is measured only up to that ceiling. A window that rises
past the ceiling came off in full, so the net figure took off wall that was
never in the gross one. How often does that happen, and by how much?

**Data.** The same 12 models of `ThatOpen/engine_web-ifc`, `tests/ifcfiles/public/`
with IfcSpaces (blob-less sparse clone, not committed).

**Method.** `node eval/opening-height-cut.mjs <files> --json eval/opening-height-cut-2026-11-21.json`
(output: `opening-height-cut-2026-11-21.txt`). In `rooms.mjs`,
`deductOpenings` now multiplies each door or window's deduction by
`heightShare`: the share of the opening's height inside the room's height band
(the room solid's lowest to highest point, the band the gross wall area is
measured over). The opening is taken as the **top** `OverallHeight` of its
body's box, since a door's stored height is the clear one from the finished
floor while its frame runs on down into the floor build-up; with no stored
size, the whole box. A centimetre past either end is not cut. Curtain walls
keep their boundary surface (already the room's face).

The first version cut the body's whole box proportionally. That took 0.4 m2
off duplex's 25 doors (frames 1-5 cm under the floor whose stored 2.134 m
opening sits wholly above it) and 2.0 m2 off FM_ARC_DigitalHub's 13 escape
doors (1.01 x 2.25 m stored, the frame 2.40 m from 15 cm under the floor). Reading
the stored height down from the head leaves the duplex doors whole and 6 of
the 13 FM_ARC deductions too; all 12 models went from 57.5 m2 cut on 299
deductions to 47.2 m2 on 151.

## Results

| model | deductions | past ceiling > 5 cm | below floor > 5 cm | cut | m2 cut |
|---|---:|---:|---:|---:|---:|
| ARK_NUS skolebygg | 943 | 56 | 3 | 60 | 38.1 |
| schependomlaan | 499 | 0 | 138 | 80 | 5.9 |
| HouseZ | 19 | 0 | 3 | 3 | 2.1 |
| FM_ARC_DigitalHub | 170 | 0 | 13 | 7 | 0.6 |
| Office_A | 248 | 1 | 0 | 1 | 0.4 |
| the other 7 | 1,097 | 0 | 0 | 0 | 0 |
| **all** | | | | **151** | **47.2** |

Across 989 rooms, doors and windows off: 6,914 m2 before, 6,867 m2 after;
net wall up by the 47 m2 cut, to 58,149 m2 (+0.08%). Small in total, large where it
happens:

- **ARK_NUS's classrooms** are the case the item was written for: their
  `Vindu-Fast` 3.09 m glazing runs from the floor to 0.66 m above a 2.44 m
  lowered ceiling (rooms 02105, 02107, 02108, 02128, 02129, 03105, ...). Each
  such window took 21% more off the room's wall than the wall the room's
  height measures. 60 deductions, 38.1 m2.
- **schependomlaan's `stelkozijn` sub-frames** stand 11-15 cm below the
  finished floor and 1-5 cm past the 2.62 m ceiling; 80 of them lose the part
  outside the band (5.9 m2).
- **Office_A's** `M_Fixed:1000 x 2000` window #921 in 146 EXTERIOR VESTIBULE
  rises 0.42 m past a 2.5 m room.
- **HouseZ (unexplained).** Three openings (#27910 window, #56303 and #68982
  doors) start 0.51 m below their room's floor and end 1.6 m below its 3.15 m
  ceiling; the file has no space boundaries, so the rooms were found by
  geometry. Either the rooms' solids start on a raised floor or the openings
  sit on a lower level and the side test picked the wrong room. Not looked at
  on the model.

Counts are of (room, opening) pairs; on ARK_NUS 60 and schependomlaan 2 pairs
were not counted in the bins because their room label (number and name) is
not unique in the model; the cut itself works on the room, not the label.

## Not done

- The stored height read down from the head is a convention, not read from
  the file: a door whose frame rises above its clear opening (a transom) is
  placed too high. No model here showed one.
- HouseZ's three openings, above.
- A room solid's top is its highest point: under a sloped ceiling a window
  near the low side is not cut where the ceiling drops below it.
- No estimator has checked these figures.
