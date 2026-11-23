# Components with no body to box, placed by their placement point: 2026-11-23

**Question.** In the COBie placement check of the same day
(eval/cobie-2026-11-23.md), 203 of 1,227 components that a file contains in a
room got no room from the geometry once that containment was hidden. 174 of
them had "no body the takeoff reads". Can the point each was placed at take
the body's place, and how often does it name the room the file names?

**What those 174 are.** Every one reads with status `ok`. Revit writes them
as faceted surface models (sofas, grab bars, sinks, toilets, towel
dispensers, flow controllers). The takeoff reads such a body as a volume only
(`mesh`), with no faces kept (`shells: null`), so it gets no world box and
`assignRooms` skipped it. By file: ARK_NUS 51 (44 flow terminals, 7 flow
controllers), dental_clinic 84 (69 terminals, 15 furnishings), Office_A 23
terminals, Duplex 16 sofas and other furnishings.

**Change.** `ifc-quantity-takeoff/qto.mjs` keeps each element's placement
point (non-enumerable `row.origin`, metres) when its body gives no box.
`rooms.mjs assignRooms` then tests that point against each room's solid:
10 cm above it first (a family's insertion point is on the floor), then 10 cm
below (on a ceiling), then the point itself. The smallest room that holds it
wins, as for boxes. A row placed this way carries `spaceBy: "placement point"`.

**Method.** `node eval/cobie-placement.mjs FILES... --json
eval/cobie-placement-point-2026-11-23.json` on the same 25 public files
(ThatOpen/engine_web-ifc `tests/ifcfiles/public`), output in
`eval/cobie-placement-point-2026-11-23.txt`. The script now also counts the
components placed by their point. It also had a bug: without `--json` it
dropped the first file argument. That is fixed. The 2026-11-23 run passed
`--json`, so its numbers are unaffected.

## Result

| contained components, containment hidden (1,227) | before | after |
| --- | --- | --- |
| placed in the file's room | 935 (76.2%) | 1,068 (87.0%) |
| placed in another room | 89 | 95 |
| left blank | 203 | 64 |
| ... of them placed by their point | - | 139, 133 in the file's room (95.7%) |

| file | same before | same after | by point (right / placed) |
| --- | --- | --- | --- |
| ISSUE_068_ARK_NUS_skolebygg | 763 / 903 | 811 / 903 | 48 / 51 |
| dental_clinic | 114 / 219 | 169 / 219 | 55 / 57 |
| Office_A_20110811 | 13 / 38 | 27 / 38 | 14 / 15 |
| duplex | 45 / 61 | 61 / 61 | 16 / 16 |

The doors-and-windows check, the exported rows and the QC counts are
unchanged on all 25 files: those exports' components are already contained,
or placed by their box.

## What is left

- **35 wall-hosted fittings** (Office_A 8, dental_clinic 27): towel
  dispensers, grab bars, toilet paper holders, shower seats, one wall cabinet.
  Their point sits on the wall face, which is the room's own boundary, or
  89 mm behind it (a recessed dispenser). Tried and dropped: a 20 cm step off
  the wall along the placement's Y axis. It placed 3 more when stepping +Y
  first, and with -Y first it put 2 in the room on the other side of the
  wall. That is too little, too unsure. The host wall's side (the room the
  wall faces at the point) would settle it.
- ARK_NUS's 85 furniture items in another room (unchanged; see
  eval/cobie-2026-11-23.md).

Reproduce: clone `ThatOpen/engine_web-ifc` (sparse, `tests/ifcfiles/public`),
then `node eval/cobie-placement.mjs <files> --json out.json`.
