# Doors and windows the file bounds on one side only, 2026-11-23

**Question.** eval/cobie-flat-pieces-2026-11-23.md left 20 doors and windows
for which geometry (`openingSides` in `ifc-quantity-takeoff/rooms.mjs`, a
point 20 cm either side of the opening, through its wall, tested against each
room's solid) finds a room that the file's own `IfcRelSpaceBoundary` rows do
not name. Is geometry wrong there, or is the file?

**Method.** `node eval/door-extra-room.mjs FILES... --json OUT.json` lists
each such opening with the rooms each probe finds (20, 60 and 100 cm out on
each side), its host wall (IfcRelFillsElement, then IfcRelVoidsElement), and
whether the file bounds that host wall to the file's room and to the extra
room. Run over the same 25 public files (ThatOpen/engine_web-ifc
`tests/ifcfiles/public`); output in `eval/door-extra-room-2026-11-23.txt` and
`.json`. All 20 are in two files.

## dental_clinic: 18 windows, each bounded to the roof outside only

dental_clinic has 312 doors and windows. 18 windows carry space boundaries,
and every one of them names a single space: `2R01 ROOF` or `2R02 ROOF`, the
spaces Revit modelled over the lower roofs outside the second floor. None
names the room the window is in. The other windows carry no boundaries.

For each of the 18, every probe on one side lands in a second-floor room
(2D11 CMDR OFFICE, 2D20 CONF. ROOM, 2C16 CERAMIC LAB, ...), and every probe on
the other side lands in the ROOF space, at 20, 60 and 100 cm alike. The host
wall (an exterior wall, `Basic Wall:Exterior - Insul Panel on Mtl. Stud`)
is bounded by the file to **both** the ROOF space and the room. The window
lies inside the room's height band (window 5.48 to 7.21 m; room 4.57 to
7.37 m) and the room's box starts at the wall's inner face (y = 9.93). So the
window is in the room's exterior wall, at window height in the room: the
file's boundaries leave out the side a facility manager looks for.

## schependomlaan: 2 doors

- `#244556 D1R`, bounded to 3.05 gang only; geometry adds 3.07 slaapkamer 2.
  The file bounds no door to 3.07 slaapkamer 2 at all. The same door type one
  floor down, `#227798 D1R`, is bounded to both 2.05 gang and 2.07 slaapkamer
  2. A bedroom with no door is the file's slip.
- `#272494 merk A5`, bounded to A0.02 berging only; geometry adds A0.00
  entree. Every probe on that side lands in the entrance hall; the door is
  0.11 m deep, an inside door between the two. The host proxy wall is bounded
  to the store only, so this one rests on geometry alone.

## What changed

`deductOpenings` (`ifc-quantity-takeoff/rooms.mjs`) consulted geometry only
for an opening the boundaries name nowhere. Now, for an opening they name in
**one** room, it also runs `openingSides`; when that finds two rooms and one
of them is the room the file names, the other is taken too
(`facesFrom: "boundary+geometry"`). Where geometry does not find the file's
room, nothing is added. A test in `rooms.test.mjs` covers both (fails on the
old code, passes on the new).

Every takeoff row and room dumped before and after on the 25 files: exactly
these 20 openings changed, and 17 rooms.

| | before | after |
| --- | --- | --- |
| openings whose rooms changed | | 20 (18 dental, 2 schependomlaan) |
| rooms whose net wall area changed | | 17, each down by its window or door |
| e.g. 2D11 CMDR OFFICE (2 windows) | 1 opening, 40.92 m2 net | 3 openings, 37.45 m2 |
| e.g. 2C14 GEN. DENT. DTR #10 | 0 openings, 37.75 m2 | 1 opening, 36.01 m2 |
| any other row or room | | none |

In the COBie workbook a window's Space cell now reads, for example,
`2R02,2D20` (roof space and conference room) where it read `2R02`.

The ROOF spaces keep their windows: they are spaces in the file, and the
takeoff does not decide which spaces are rooms.

## What is left

- Whether a COBie export should drop exterior spaces like `2R02 ROOF` from a
  component's Space cell is a client's call (a BIM manager's read).
- ARK_NUS's 9 components placed in another room (eval/cobie-flat-pieces-2026-11-23.md).
- `merk A5` rests on geometry alone; a site check or the authoring model
  would settle it.
