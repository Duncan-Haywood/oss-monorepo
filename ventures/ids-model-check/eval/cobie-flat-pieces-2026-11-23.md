# Rooms that were empty: a flat sliver in a room's solid, 2026-11-23

**Question.** After the box-sample fix of the same day
(eval/cobie-wall-hosted-2026-11-23.md), 17 dental_clinic casework items (counter
tops, base and upper cabinets in 2C17 PROSTH. LAB and 1D11 INTERACTION
STATION) still got no room from geometry. Each box sat inside its room's box,
but outside the room's solid at all 125 sample points. Did those rooms' solids
leave out the casework zone?

**What was really wrong.** They did not. 2C17's solid is 14 convex pieces,
nine added and five subtracted, adding up to the right 80.04 m3. One
subtracted piece is flat. It lies in the plane of the room's west wall
(x = -47.113), and its volume is rounding noise (5e-15 m3). `pointInSolid`
(`ifc-quantity-takeoff/rooms.mjs`) tests a point against each convex piece by
checking that it is on the same side of every face as the piece's middle. A
flat piece's middle lies on its own faces, so the test took a whole half-space
as inside the sliver. Every point in the room was then counted once for the
real piece and taken away once for the sliver. The room was empty: a grid
over its box found 26% of it inside, against 93% by volume.

The fix skips a convex piece whose volume is below 1e-9 of the cube of its
diagonal. Such a piece has no inside to test. A test in `rooms.test.mjs` uses
the file's own sliver, coordinates copied as read. It fails on the old code
and passes on the new.

## Every room's solid against its own volume

A grid of 12 x 12 x 12 points through each room's box, tested with the old and
new `pointInSolid` (now `eval/room-inside-grid.mjs`). The share of points inside should match the room's volume
over its box volume. 852 rooms with a convex-piece solid in 12 public files
(dental_clinic, ARK_NUS, Office_A, duplex, schependomlaan, FM_ARC_DigitalHub,
kleine_Wohnung_R22, HouseZ, C20-Institute-Var-2, AC20-FZK-Haus, S_Office,
tested_sample_project):

| | old | new |
| --- | --- | --- |
| rooms whose share is off by more than 0.15 | 29 | 0 |
| rooms where any point changed | 55 | |

The faults went both ways. Some rooms were emptied (dental 2B18 PH TECH, 2BC3
and 2CC4 CORRIDOR; ARK_NUS 01117, 02020, 02062, 02122, 03124; Office_A 122
RECYC and 221 OPEN OFFICE, all at 0.00). Others swelled to fill their whole box
and took their neighbours' furniture (Office_A 108 ELEC RM, 0.71 by volume
read as 1.00; 121 CORRIDOR 0.60 as 1.00; FM_ARC's west stair 0.55 as 1.00;
dental 2BC5 CORRIDOR 0.58 as 1.00). A swollen room is the smallest room
holding a point in its box, so it won the point. After the fix every room's
share is within 0.15 of its volume.

## COBie placement (eval/cobie-placement.mjs, the same 25 files)

`node eval/cobie-placement.mjs FILES... --json
eval/cobie-flat-pieces-2026-11-23.json`. Output in
`eval/cobie-flat-pieces-2026-11-23.txt`.

| contained components, containment hidden (1,227) | before | after |
| --- | --- | --- |
| placed in the file's room | 1,117 (91.0%) | 1,218 (99.3%) |
| placed in another room | 93 | 9 |
| left blank | 17 | 0 |

| file | same before | same after |
| --- | --- | --- |
| ISSUE_068_ARK_NUS_skolebygg | 813 / 903 | 894 / 903 |
| dental_clinic | 200 / 219 | 219 / 219 |
| Office_A_20110811 | 37 / 38 | 38 / 38 |

In ARK_NUS the grid test changed for 18 rooms. Five had been empty (01117,
02020, 02062, 02122, 03124) and most others read a little too large, which is
the likely route of the 81 components that had gone to a neighbour (not traced
one by one).
Dental's two components that had gone to another room (towel dispensers 3695
and 3712, in the corridor) now land in the room the file names.

| doors and windows vs the file's space boundaries (869) | before | after |
| --- | --- | --- |
| exactly the file's rooms | 791 | 821 |
| one of their two rooms | 37 | 8 |
| a room the file does not name as well | 13 | 20 |
| a different room | 6 | 0 |
| none | 22 | 20 |

All changes are in dental_clinic (203 to 232 of 254 same) and Office_A (92 to
93 of 93). The 7 new "extra" rows are dental doors where geometry now finds a
room on both sides while the file writes a space boundary for one side only.
This run did not check which reading is right.

**Room quantities.** Floor area, perimeter, height and volume come from the
solid's own geometry, not this test, and none changed. Wall openings found by
geometry did change, in rooms with no space boundaries: 15 ARK_NUS rooms and 1
Office_A room, with net wall area moving both ways (Office_A room 89 gained
its 7 windows, 12.6 m2). Dental's room openings come from boundaries and did
not change, apart from one room gaining one door.

**Other rows (74,198 takeoff rows and rooms, dumped before and after).** Apart
from door and window sides and the counts above, 5 dental rows that the file
does not put in a room changed. One furnishing (2283) moved from 2A11 DENTAL
WAITING to 2A14 ADMIN by box sample. One covering moved room (3289, 1A16 to
1AC1). One gained a room (3207, 2AC3 CORRIDOR). Two kept their room but are
now placed by the middle-of-box test instead of the box sample. The QC
error count fell by 7 on Office_A and 1 on dental. No element's volume changed.

## What is left

- ARK_NUS's 9 components still placed in another room.
- The 20 doors and windows given a second room the file's boundaries do not
  name: in each case, check whether the door really opens onto that room.

Reproduce: clone `ThatOpen/engine_web-ifc` (sparse, `tests/ifcfiles/public`),
then `node eval/cobie-placement.mjs <files> --json out.json`.
The room grid check: `node eval/room-inside-grid.mjs <files>` (the 12 files
above: 852 rooms, 0 off).
