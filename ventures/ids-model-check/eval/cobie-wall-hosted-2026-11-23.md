# Wall-hosted fittings: the room most of the box stands in, 2026-11-23

**Question.** After the placement-point fix of the same day
(eval/cobie-placement-point-2026-11-23.md), 64 of 1,227 components that a
file contains in a room still got no room from geometry once that
containment was hidden. 35 were wall-hosted fittings (towel dispensers, grab
bars, fire extinguisher cabinets) whose point sits on the wall face or behind
it. Can they be placed, and by what?

**What was really wrong.** Those fittings are Revit faceted surface models
whose shells are not closed. The takeoff refused a section for an open shell
(right) but also dropped its points, so the element had no box at all. An
open PR from 2026-11-21 (PR #18042, "open shells keep their box") already
fixed this in `geom.mjs`, but it had gone stale behind a conflicting
`diff.mjs` change. This run ported only its geometry part (the `loose`
loops, and its test), credited in the code.

With a box, most fittings land in the right room through the usual middle-of-box
test. A recessed one does not. Its middle is inside the wall, so in no room.
`rooms.mjs assignRooms` now samples such a box at 5 x 5 x 5 points, and the
room most of them fall in wins (the smaller room on a tie). The row gets
`spaceBy: "box sample"`. This runs only when the middle-of-box tests find
nothing, so an element they already placed never moves.

**Method.** `node eval/cobie-placement.mjs FILES... --json
eval/cobie-wall-hosted-2026-11-23.json` on the same 25 public files
(ThatOpen/engine_web-ifc `tests/ifcfiles/public`). Output is in
`eval/cobie-wall-hosted-2026-11-23.txt`. The script now also counts rows placed
by box sample. A second script dumped every takeoff row (volume, areas,
length, box, envelope, room) before and after, on 28,900 rows in the same files.

## Result

| contained components, containment hidden (1,227) | before (placement point) | after |
| --- | --- | --- |
| placed in the file's room | 1,068 (87.0%) | 1,117 (91.0%) |
| placed in another room | 95 | 93 |
| left blank | 64 | 17 |
| ... of them placed by box sample | - | 37, 37 in the file's room |

| file | same before | same after | by box sample |
| --- | --- | --- | --- |
| ISSUE_068_ARK_NUS_skolebygg | 811 / 903 | 813 / 903 | 0 |
| dental_clinic | 169 / 219 | 200 / 219 | 25 / 25 |
| Office_A_20110811 | 27 / 38 | 37 / 38 | 6 / 6 |
| ISSUE_159_kleine_Wohnung_R22 | 0 / 6 | 6 / 6 | 6 / 6 |
| duplex | 61 / 61 | 61 / 61 | 0 |

The placement-point fallback now places none of these, because every one of
those bodies has a box. It stays for bodies the reader cannot draw.

**What else changed (28,900 rows).** 362 elements gained a box. No volume,
area or length changed. No element lost or changed its room. 152 elements
that no file puts in a room got one (schependomlaan 139: 115 coverings, 20
proxies, 4 distribution elements; FM_ARC 6 proxies; dental 6 coverings; ARK_NUS
1 proxy). The file gives no truth for those. 31 walls changed their envelope
reading because walls that had no box now take part in the test. Where the
file says IsExternal, the new readings agree 4 of 4 (dental 3, schependomlaan
1). HouseZ (22 changes, 7 walls turned interior) stores no IsExternal, so
those changes are unscored. The COBie export changed in one file:
schependomlaan's QC errors went from 53,689 to 53,685, because 4 more
components have a room.

## What is left

- **dental_clinic's 17 casework items** (counter tops, base and upper
  cabinets in 2C17 PROSTH. LAB and 1D11 INTERACTION STATION). Each box is
  inside its room's box but outside the room's solid at all 125 sample points.
  Next step: find out whether those rooms' solids leave out the casework zone.
- ARK_NUS's 90 components in another room (see eval/cobie-2026-11-23.md).
- Two dental towel dispensers (3695, 3712) are in a corridor whose solid
  holds the box's middle. The toilet holds only the face of the box (50 of
  125 points to the corridor's 125). They are counted as "another room".

Reproduce: clone `ThatOpen/engine_web-ifc` (sparse, `tests/ifcfiles/public`),
then `node eval/cobie-placement.mjs <files> --json out.json`.
