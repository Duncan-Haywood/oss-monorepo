# Doors and windows cut at the room's ceiling, 12 public IFC models, 2026-11-21

**Question.** The net wall finish per room (eval/net-wall-finish-2026-11-21.md)
took every door and window off in full. The gross figure it comes off is the
room's perimeter times the height of the room's solid, so a window that rises
above that solid's top (a lowered ceiling, a room drawn to a set ceiling
height) took off wall the gross figure never counted. How often does that
happen, and how much area is it?

**Data.** The same 12 models of `ThatOpen/engine_web-ifc`,
`tests/ifcfiles/public/` (sparse clone, not committed).

**Method.** `node eval/ceiling-cut.mjs <files> --list 60 --json eval/ceiling-cut-2026-11-21.json`
(output: `ceiling-cut-2026-11-21.txt`). `rooms.mjs`, `heightShare`: where an
opening's world box reaches more than 5 cm above the room's top, it comes off
at its area x the share of its height, measured from the room's floor, that
lies below the room's top. An opening wholly above the room comes off not at
all. `deductOpenings(..., { clip: false })` gives the old figure; the eval
reads it back as `openingArea + clippedArea`, and those "before" figures equal
eval/net-wall-finish-2026-11-21.txt's on all 12 models.

**The floor is not cut.** The first version cut both ends. It then cut 203
openings, nearly all doors whose bodies run below the room's floor:
FM_ARC_DigitalHub's escape doors from -0.15 m (body 2.40 m, stored height
2.25 m), schependomlaan's door frames 6-11 cm into the floor build-up and
HouseZ's doors from -0.51 m. The stored OverallHeight already leaves that part
out, so cutting it took real door area off the deduction (schependomlaan 10.9
m2, 1.6% of its doors and windows). Only the top is cut now, and those models
are unchanged.

## Results

| model | rooms | doors and windows off, before | after | openings cut | rooms touched |
|---|---:|---:|---:|---:|---:|
| ARK_NUS skolebygg | 306 | 2,805.5 m2 | 2,768.8 m2 | 55 | 36 |
| Office_A | 99 | 486.6 m2 | 486.2 m2 | 1 | 1 |
| the other 10 | 584 | 3,621.6 m2 | 3,621.6 m2 | 0 | 0 |
| **all** | **989** | **6,913.7 m2** | **6,876.6 m2** | **56** | **37** |

37.1 m2 that had been taken off wall the gross figure never held now stays
on (0.5% of the doors and windows; 1.3% on ARK_NUS). No opening sat wholly
above its room.

**What was cut.** ARK_NUS: 43 windows and 12 doors (operable partitions, roller
shutters, a 600 mm roof hatch, "Luke600", in the teachers' room), 10-70 cm
above the room's top, 73-97% kept. In every one of those rooms the solid's
height equals the stored Height (2.4384 m in 40 cases, 2.65 m in 11, 2.9 m in
4), so the cut follows the file. Office_A: one 1.0 x 2.0 m fixed window in
"146 EXTERIOR VESTIBULE", 0.915-2.915 m in a 2.5 m room, 79% kept.

**A caution an estimator should know.** 2.4384 m is 8 ft, Revit's default
room height. The 40 ARK_NUS rooms at that height carry 2.4-2.9 m windows. The
room may have been left at the default, not drawn to a real ceiling. Then the
gross wall area is short too, and the cut keeps the net figure consistent
with it, not with the building. The room schedule's height column shows which
rooms these are.

## Not done

- The floor end. A door that starts above the room's floor (a raised
  threshold, a split-level room) is still taken in full.
- A sloped ceiling: the top used is the solid's highest point, so a window
  under the low side of a sloped ceiling is not cut.
- Curtain walls are taken at their boundary surface, which a file draws for
  each room, and are not cut.
- dental_clinic's 17 "ROOF" windows (NEXT.md): none of them is above the
  office the geometry also finds. They are not openings over a lowered
  ceiling, so that item is still open.
