# A floor below the room: HouseZ's split level, and dental_clinic's "ROOF" windows, 2026-11-24

**Question.** The opening cut (eval/opening-height-cut-2026-11-21.md) left one
case it could not explain: on HouseZ, three openings (window #27910, doors
#56303 and #68982) start 0.51 m below their room's floor, so 0.51 m of each
came off nothing and 2.1 m2 was cut. Was the room or the opening wrong? And
dental_clinic's 17 fixed windows that the file bounds only to a space called
"ROOF": what is that space?

**Data.** The same 12 models of `ThatOpen/engine_web-ifc`,
`tests/ifcfiles/public/` (blob-less sparse clone, not committed).

## HouseZ: the rooms are drawn from the storey's level over a split floor

Looked at on the model (the boxes and the slabs under each room):

- The three openings are contained in the **Site**, not the Ground Floor, and
  so are 42 walls, 10 slabs and 6 stairs. The walls hosting them (#71149,
  #73249, #72322, #69504) run from -0.51 m to 3.17 m.
- Under the west of the Ground Floor are slabs whose tops are at -0.51 m
  (#53569, -0.93 to -0.51; #65661) and -0.56 m (#56481); under the east,
  slabs whose tops are at 0 (#65164, #63610, #64658, #64703, #62550).
- Every Ground Floor room's solid runs from 0 to 3.15 m, the storey's level
  up. Sampled on a 0.5 m grid, the slab under each point of each room:

| room | floor 0.51 m down | floor at 0 |
|---|---:|---:|
| Washing Room | 100% | 0% |
| Parametricos Office | 54% | 46% |
| GF Hallway | 18% | 82% |
| Living Room, Bedroom 01 | 0% | 100% |

So the ground floor is a split level. The Washing Room stands wholly on the
lower floor, the office and hallway partly; the exporter (`ASIFC 2.15`) drew
every room from the storey's level. The openings were right and the rooms
were wrong. Each opening stands on the slab at -0.51 m in a sunken part of
its room. The cut should not have happened, and the gross wall (perimeter x
the solid's height) was short by the 0.51 m band of wall below the solid.

## What changed

`rooms.mjs`, `floorsBelow` (run by the takeoff before the openings come off):

- Each room's plan is sampled on a 0.2 m grid (coarser past 6,000 points)
  just above its solid's bottom. Under each point, the highest IfcSlab whose
  top is between 1.5 m below and 5 cm above that bottom is the floor there.
- A slab top 25 cm or less below is read as **floor build-up** (screed and
  finish over the structural slab: FM_ARC_DigitalHub's door frames run 15 cm
  under the room's floor), the floor as drawn. Deeper is a lower floor.
- A room needs 5% of its plan over a lower floor. Without that, ARK_NUS's
  gross-area zones ("1 Area", "3 Area", "19 Area", the canteen's upper part)
  picked up 0-2% at their edges over a lift pit's or stair's slab; 8 rooms,
  26 m2 of band that is not their floor.
- A room that qualifies gets `computed.floorBelow` (deepest drop, share of
  plan and of outline, the slabs, `bandArea`). `bandArea` is the perimeter
  times the mean drop along the outline's sample points, and it is added to
  `computed.wallArea` (the solid's own figure kept as `solidWallArea`).
- A door or window whose plan box (0.6 m slack) reaches sunken floor points
  is measured down to the deepest of them, not to the solid's bottom.
- The page's room schedule marks the wall area with `*` and says why in the
  cell's note.

`node eval/floors-below.mjs <files> --json eval/floors-below-2026-11-24.json`
(output: `floors-below-2026-11-24.txt`):

| model | rooms | floor below | band added m2 | openings cut m2, before -> after |
|---|---:|---:|---:|---:|
| HouseZ | 5 | 3 | 16.64 | 2.1 -> 0 |
| ARK_NUS skolebygg | 306 | 1 (0U017 heis, the lift shaft: pit slab 1.1 m down) | 8.83 | 31.1 -> 31.1 |
| the other 10 | 678 | 0 | 0 | unchanged |

On HouseZ: Washing Room 29.30 -> 34.04 m2 gross wall (+4.74), office
91.41 -> 99.55 (+8.14), hallway 89.63 -> 93.38 (+3.76). The three openings
now come off whole (40.4 m2 of openings, was 38.3), and the house's net wall
goes from 292.9 to 307.4 m2 (+4.9%): the 16.6 m2 band added, less the 2.1 m2
no longer cut.
(ARK_NUS's opening cut is 31.1 m2 with and without this change; the 38.1 m2
of the 2026-11-21 report is from before later changes on main.)

The lift shaft is a real lower floor (the shaft's walls do run down to the
pit), but whether a pit's walls belong in a finish schedule is an
estimator's call; the room is flagged either way.

## dental_clinic's "ROOF" windows: the space is the roof outside

The 18 fixed `M_Fixed:1735 x 1000mm` windows the file bounds to a "ROOF"
space (17 in the 2026-11-21 count) are all on the Second Floor, 5.48 to
7.21 m, all `IsExternal`. The spaces are `2R01 ROOF` (50.9 m2) and
`2R02 ROOF` (578.7 m2), on the Second Floor from 4.57 to 8.57 m (4.0 m, the
default height), OmniClass "13-81 11 99: Other General Facility Spaces": rooms drawn over
the first floor's flat roof, outside the second floor's walls. Since
2026-11-23 (ids-model-check eval/door-extra-room-2026-11-23.md) each window
also comes off the office the side test finds behind it (2C09, 2D20, 2D11,
2C16 and others); the takeoff now lists all 18 with both sides. So the
office figures are right. The ROOF spaces' own wall and net wall figures are
not a finish anyone prices: they are rooms on a roof.

## Not done

- The band is the outline's mean drop times its length. It does not add the
  riser between a room's two floor levels (the step inside the office and
  hallway), which is wall finish too.
- A slab is the floor wherever its body holds a point 1 cm under its box's
  top. A sloped or stepped slab is read at its highest point only, and a
  floor drawn as an IfcCovering is not looked for.
- The 25 cm build-up limit and the 5% share are judgement, set from these 12
  models. A sunken floor under 25 cm (a shower tray, a stepped bathroom) is
  read as build-up.
- Spaces drawn outside the building, like dental_clinic's "ROOF", are not
  told apart from rooms.
- No estimator has checked these figures.
