# Net wall finish per room, 12 public IFC models, 2026-11-21

**Question.** The room schedule (eval/rooms-2026-11-21.md) gave each room's
wall area as perimeter x height: the gross wall finish. A painter or
plasterer prices the net figure, with the doors, windows and glazed walls
taken off. Which openings are in which room's walls, how big is each, and
can the takeoff tell when the file does not say?

**Data.** The 12 models of `ThatOpen/engine_web-ifc`, `tests/ifcfiles/public/`
that have IfcSpaces (blob-less sparse clone, not committed): AC20-FZK-Haus,
ISSUE_005_haus, duplex, Office_A_20110811, dental_clinic, C20-Institute-Var-2,
FM_ARC_DigitalHub, schependomlaan, kleine_Wohnung_R22, HouseZ, example and
ARK_NUS skolebygg. Nine carry space boundaries (`IfcRelSpaceBoundary`); three
(ARK_NUS, kleine_Wohnung, HouseZ) do not.

**Method.** `node eval/net-wall-finish.mjs <files> --json eval/net-wall-finish-2026-11-21.json`
(output: `net-wall-finish-2026-11-21.txt`). `rooms.mjs`, `deductOpenings`:

1. **Which rooms.** Where the file's space boundaries name a door or window,
   it comes off in each room they name. A door or window no boundary names is
   placed by where it stands (`openingSides`): the middle of its body, moved
   out through its thinner horizontal side (through the wall) by half its
   depth plus 20 cm each way, then 60 cm for a side that found nothing, and
   tested against each room's solid. A door between two rooms comes off in
   both.
2. **How big.** A door or window comes off at its stored `OverallWidth x
   OverallHeight`; else at its boundary surface's area; else at its body's
   width x height. A curtain wall comes off at its boundary surface's area.
3. **Once.** In each room, a door or window piece whose box lies mostly
   inside a larger piece's (half or more along every axis, 5 cm slack) is not
   taken again.

Net wall area = perimeter x height less the doors, windows and curtain walls,
never below zero.

## Results

| | |
|---|---:|
| rooms measured | 989 |
| gross wall area | 65,368 m2 |
| doors and windows off | 6,914 m2 (10.6%) |
| curtain walls off | 352 m2 (dental_clinic) |
| deductions named by space boundaries | 1,330 |
| deductions found by where the opening stands | 1,419 |
| door or window pieces inside a larger one, not taken twice | 234 (229 schependomlaan, 5 dental_clinic) |

**The geometric test checked against the files' own boundaries.** On the
nine models with boundaries, each door and window they name was also placed by
geometry alone, as if the file had none, and the rooms found compared with the
rooms the file names:

| model | openings | same rooms | some of them, none wrong | none found | a room the file does not name |
|---|---:|---:|---:|---:|---:|
| AC20-FZK-Haus | 16 | 16 | 0 | 0 | 0 |
| ISSUE_005_haus | 16 | 16 | 0 | 0 | 0 |
| duplex | 28 | 25 | 3 | 0 | 0 |
| Office_A | 93 | 92 | 1 | 0 | 0 |
| dental_clinic | 254 | 203 | 32 | 2 | 17 |
| C20-Institute | 283 | 282 | 0 | 1 | 0 |
| FM_ARC_DigitalHub | 109 | 108 | 1 | 0 | 0 |
| schependomlaan | 58 | 49 | 0 | 7 | 2 |
| **all** | **857** | **791 (92.3%)** | **37** | **10** | **19 (2.2%)** |

Of the 19 that disagree, 17 are dental_clinic's 1735 x 1000 fixed windows:
the file names only a space called "ROOF" for each, while the geometry finds
the office on the other side as well. The other two are schependomlaan doors
between two rooms (a corridor and a bedroom, an entrance and a store) for
which the file names only one side. Neither is clearly a geometry error; the
schependomlaan pair looks like the file's. An estimator should look at the
"ROOF" windows on the model.

**Boundary surfaces are not opening sizes.** Each door or window boundary's
surface area was compared with the opening's stored OverallWidth x
OverallHeight:

- ArchiCAD-style `IfcCurveBoundedPlane` boundaries (C20, FZK-Haus): 358 of
  359 and 17 of 19 within 2%.
- FM_ARC_DigitalHub: 79 of 170; the rest 5.4% larger (the frame).
  schependomlaan: 5 of 44; most 4.8% larger.
- Revit's `IfcSurfaceOfLinearExtrusion` boundaries (Office_A, dental_clinic,
  duplex): 0 of 705. Revit writes a door's boundary as the frame's width swept
  up the room's height: on Office_A every one is 1.366 x width x height
  (1.067 m frame x 2.5 m room height, for a 0.915 x 2.134 m door). Some duplex
  surfaces are 0.7% of the opening.

So the stored overall size is used first and the boundary surface only when an
opening stores none. Read the other way, the first version of this pass used
the boundary surface first and took 23% more door area off Office_A (618.9 m2
against 486.6 m2).

**Openings that face no room.** kleine_Wohnung: 67 of 99, none within 0.5 m
of any room's box (the model has rooms for only part of the building).
HouseZ: 19 of 37; 6 lie within 0.5 m of a room's box and were not placed.
schependomlaan: 41 of 464, after the 60 cm second probe (309 with 20 cm alone:
its window sub-frames sit in the outer face of the wall).

**Speed.** The pass reads every boundary once and tests two to four points per
unnamed opening. ARK_NUS (1,003 geometric deductions) took 21 s for the
whole takeoff here; eval/rooms-2026-11-21.md measured 12-15 s on another
container, so the pass's own cost was not separated.

## Not done

- The opening's area within the room's wall height only: a window that rises
  above a lowered ceiling comes off in full.
- A reveal (the wall's thickness round an opening) is not added back.
- Curtain walls that no boundary names (ARK_NUS's 852 members) are not taken
  off: the geometry would need the wall's face, not a box.
- No estimator has checked these figures.
