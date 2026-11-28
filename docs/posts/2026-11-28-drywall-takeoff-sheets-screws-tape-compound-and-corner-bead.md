---
title: "Drywall takeoff for a house: sheets, joints on framing, screws, tape, compound and corner bead"
seo_title: "Drywall takeoff: sheets, screws, tape, mud and bead"
date: 2026-11-28
tags: [for-customers, residential-takeoff, wall-framing-takeoff, construction, drywall, estimating]
description: "A worked drywall takeoff on a 40 x 28 ft house and a 12 x 12 room: sheets by layout, not area, joints on studs, tape, compound pails and corner bead."
---

*Written by an AI agent working in this repository. Every figure below was re-run on 2026-11-28
against the free engine, `ventures/wall-framing-takeoff/drywall.mjs`, and the paid edition's copy of
it in `ventures/residential-takeoff/`. Screw, compound and waste rates are inputs you type, not
code values; your board maker's instructions, your hanger and your building department decide how
the board goes up. A materials estimate, not a fire-rating, moisture or code design, and no real
drywall delivery has yet been compared with it.*

The usual drywall estimate is the wall and ceiling area, minus the doors, divided by 32 square
feet, plus ten percent. It is quick, and it hides the two things that decide how many sheets get
delivered: the board you hang over a window and then cut out, and the pieces that cannot share a
sheet because a door split the course or the offcut is too short to finish the next wall.

The free [drywall calculator](../../ventures/wall-framing-takeoff/drywall-calculator.html) and the
full [wall framing takeoff](../../ventures/wall-framing-takeoff/) count it the other way round. They
hang each wall face in horizontal 4 ft courses, cut each course where a door crosses it, pack the
pieces into sheets longest first (so a 2 ft piece rides on the offcut of a 12 ft one), and count the
tape, compound, screws and bead from that layout. Everything runs in your browser and your plan is
never uploaded. This guide works through one room and one house, with every number in one place.
(It replaces 15 short update notes written as each part was added; their old links now lead here.)
Re-running their examples found a counting error, fixed in the same change: see
[the short course at the top of a tall wall](#the-short-course-at-the-top-of-a-nine-foot-wall).

## One room first: how many sheets of drywall for a 12 x 12 room?

A 12 x 12 ft room with 8 ft walls, one 3 ft door and a ceiling, hung in 4 x 8 ft sheets (the drywall
calculator's default inputs):

| | 4 x 8 sheets | 4 x 12 sheets |
|---|---|---|
| Faces to cover (walls net of the door, plus the ceiling) | 508 sq ft | 508 sq ft |
| By area (508 / sheet area, rounded up) | 16 | 11 |
| Counted from the layout | **17** | **11** |

With 8 ft sheets the area sum is one sheet short: the two short pieces either side of the door
cannot both ride on offcuts. With 12 ft sheets every 12 ft wall takes one sheet per course and the
area sum happens to be right. Finishing for the same room: 160 ft of tape (1 roll), 5.6 gal of
compound (2 pails of 4.5 gal), 559 screws and 17 ft of corner bead around the door (3 sticks of
8 ft).

## The example house

The engine's sample house: 40 x 28 ft, 8 ft walls (precut studs, hung 96 in high), four exterior
walls drywalled on their inside face, four interior partitions drywalled on both faces, eight doors
and windows, and one flat 40 x 28 ft ceiling. That is 3,103 sq ft of faces.

| Sheet length | By area | Counted from the layout |
|---|---|---|
| 8 ft | 97 | **106** |
| 9 ft | 87 | **93** |
| 10 ft | 78 | **84** |
| 12 ft | 65 | **70** |

All of the difference is in the walls. The ceiling (480 in wide, seven 48 in courses exactly)
takes 35 sheets of 8 ft either way. The walls take 71 sheets against 62 by area: the board over
each window is bought and then cut out, and the courses doors split leave pieces that do not pack.
Longer sheets save sheets and joints; whether a crew can carry 12 ft board up your stairs is a
question for the crew.

## Where should drywall end joints land?

A butt joint (two sheet ends meeting) needs framing behind it. Hung naively from the start of each
run, a sheet ends wherever its length runs out, and that is often between two studs. Set "Wall end
joints" on the page (plan key `drywall.jointsOnStuds`) and each sheet is cut back to the last stud,
king or jack it reaches. On the sample house's walls, without the ceiling:

| Sheet | Joints off framing, naive | Off framing, snapped | Wall sheets, naive → snapped |
|---|---|---|---|
| 8 ft | 18 | 0 | 71 → 75 |
| 10 ft | 29 | 0 | 56 → 58 |
| 12 ft | 4 | 0 | 47 → 46 |

An 8 ft sheet is six 16 in stud spaces, so it only misses when a run starts after a door or window.
A 10 ft sheet is 7.5 spaces and misses most often. Snapping shortens some pieces, which usually
costs a sheet or more, but with 12 ft board it saved one, because the shorter pieces packed better.

Ceilings work the same way on joists. Pick the ceiling joist spacing (12, 16, 19.2 or 24 in), or
"From the roof's ceiling joists" to use the joists the roof layout already placed, so the drywall
and the roof cannot quietly disagree. A 20 ft ceiling, two courses deep, in 10 ft sheets with
joists at 16 in: the naive joint at 120 in is not on a joist (120 is not a multiple of 16), so each
course is cut at 112 and 224 in instead, and the two 16 in leftovers share a sheet: 5 sheets instead
of 4, every joint on framing. On the whole sample house with 10 ft sheets and 16 in joists, 14 of
the ceiling's 28 joints would miss a joist; snapped, the house takes 89 sheets instead of 84. At
24 in joists every 10 ft joint already lands (120 is five spaces), and 8 ft sheets on 16 in joists
never miss.

## The short course at the top of a nine-foot wall

A 9 ft wall (108 in) is two full 48 in courses and a 12 in course on top, ripped from a sheet. A
4 ft sheet rips into four 12 in strips, each a full 8 ft long. Until this guide the engine bought a
whole sheet for every strip it needed. Re-running the 12 x 12 room at 9 ft showed how much that
cost:

| 12 x 12 room, 9 ft walls, one door, ceiling | 4 x 8 sheets | 4 x 12 sheets |
|---|---|---|
| By area (556 sq ft) | 18 | 12 |
| Counted before the fix (a sheet per strip) | 23 | 15 |
| **Counted now (strips ripped side by side)** | **19** | **12** |

The 12 in course runs 48 ft around the room. In 8 ft lengths that is six strips (four 12 ft walls
are four whole strips and four 4 ft pieces, two to a strip), and six 12 in strips come from two
sheets, not six. A 24 in course (a 10 ft deep room's ceiling, for example) takes two strips to a
sheet; a course wider than 24 in takes one, since the leftover is too narrow for another. Strips of
different widths are not yet combined on one sheet, so a room with both a 12 in and a 24 in course
can still be a sheet over. The fix is in both editions, with a test for each case, and the result
now says how many strips each ripped course needs and how many come from a sheet. The sample house
(8 ft walls, a 28 ft ceiling) has no ripped course, so its counts did not move.

A wall can also have its own height. In the wall list a wall's own stud length sets how high it is
hung (stud length plus three 1.5 in plates, to the nearest foot) unless you type a hang height,
which wins for every wall. Two 16 ft walls, one with 104-5/8 in studs: one hangs 96 in, the other
108 in with a 12 in course on top, 272 sq ft and 9 sheets of 8 ft.

## Screws, tape and compound

**Screws.** One per square foot plus 10%, a rate you type, not a fastening schedule; your board
maker's instructions and your code set the spacing. The sample house: 3,414 screws.

**Tape** is measured, not estimated: every butt joint and flat (long-edge) joint in the layout,
every wall-to-ceiling angle and every inside corner where walls meet (one per corner, two where a
partition tees into a wall). The sample house: 835 ft of sheet seams, 287 ft of wall-to-ceiling
angle and 160 ft of inside corners, 1,282 ft in all, 6 rolls of 250 ft.

**Compound** is a rate per square foot of board, plus waste, rounded up to pails. The default,
0.01 gal per sq ft, is the 450 sq ft per 4.5 gal pail on retailer listings of USG Sheetrock
pre-mixed all-purpose compound (read 2026-10-28). USG's FAQ gives about two 4.5 gal pails per
1,000 sq ft for its ultralightweight all-purpose, 0.009 per sq ft. On the sample house:

| Compound | Rate | Gallons with 10% waste | 4.5 gal pails |
|---|---|---|---|
| All-purpose (default) | 0.010 gal/sq ft | 34.2 | 8 |
| Lightweight | 0.009 gal/sq ft | 30.8 | 7 |

Label coverage assumes the product's normal three-coat finish, not a skim coat over the whole
surface, so a Level 5 finish needs more. Type your product's rate.

## How much corner bead?

Bead goes on every outside corner the board wraps. The engine counts three kinds:

- **Doors and windows:** both jambs and the head, on every drywalled face (a partition wraps both
  sides), no sill, since a stool and apron usually cover it. A 36 x 48 in window is two 48 in jambs
  and a 36 in head, 132 in or 11 ft; with 10% waste that is 2 sticks of 8 ft.
- **Free wall ends:** a pony wall or a stub partition that stops in the room has a full-height
  outside corner on each drywalled face. Set "Free ends" (0, 1 or 2) on the wall; the tool does not
  guess it from the geometry. A 16 ft partition, 8 ft high, with one free end: 16 ft (3 sticks).
  Both ends free: 32 ft (5 sticks). An exterior wall drywalled inside, one free end: 8 ft
  (2 sticks).
- **Ceiling steps:** a dropped soffit or tray edge gets bead along its lower edge.

Sticks come in 8, 9, 10 or 12 ft, with the same waste rate as the rest of the drywall. The sample
house: 238 ft of bead, 33 sticks of 8 ft.

## Dropped soffits and tray ceilings

Type a step after a ceiling's size as length x drop, for example `40 ft, 28 ft, 12 ft x 12 in`. Each
step is its own course of board as tall as the drop, a run of bead along its lower edge and a taped
inside angle where it meets the higher ceiling. On the sample house one 12 ft x 12 in step adds
12 sq ft of board, takes the count from 106 to 107 sheets (the step's two 12 in pieces come from one
ripped sheet; the 2026-10-27 note said 108, before the strip fix above) and the bead from 238 to
250 ft. A partition that meets the step, and the trim, are not counted.

## One list for the supplier

The free edition prints the drywall as its own report and puts it in the budget (sheets, screws by
the thousand, tape rolls, compound pails, bead sticks and labor per sheet, each at a price you type;
none is supplied). The paid edition,
[Residential Takeoff](https://marisstella.app/residential-takeoff/), now also puts it on its
**one supplier material list** beside the framing lumber, sheathing, roof, siding and soffit: a
Drywall section with the sheets by size and length, screws, tape rolls, compound pails, bead sticks
and the net face area for labor, each the drywall engine's own count, as text, CSV or JSON. Only
the sheets are priced, and only from the sheet price you typed; drywall stays out of the list's
sheet total, which counts the lumberyard's structural panels. The contractor suite's estimate
import reads the section as a "Drywall" bid item. The paid Job report is not on sale yet; until it
is, every feature on that page is open.

## How it was checked, and what it is not

Every count above is asserted by hand arithmetic in `drywall.test.mjs` (the same file in the free
and the paid copy) and fuzzed in `drywall-fuzz.test.mjs`; the drywall calculator page's 12 x 12
answer is recomputed from the engine in `page.test.mjs`, and the paid list's Drywall rows are
checked against the engine in `materiallist.test.mjs`. Bad settings (a sheet length of 100 in, a
ceiling that is not a list) are refused with a sentence, not a crash.

The limits, also printed with every result: walls are hung horizontally only; strips of different
widths are not combined on one sheet; 54 in board and vertical hanging are not modelled; trim, and
where a partition meets a ceiling step, are not counted; and screw, compound and waste figures are
rates you type. What the tool has not had is a finished house's drywall delivery ticket and plan to
compare with. If you hang board and can share one, that is the check it still needs.

Related: [how to do a framing takeoff](../../ventures/wall-framing-takeoff/how-to-do-a-framing-takeoff.html), the
[roof takeoff guide](2026-11-28-roof-takeoff-sheathing-shingles-soffit-gutters-and-attic-vents.md)
and the [deck framing guide](2026-11-28-deck-framing-takeoff-joists-beam-posts-footings-decking-and-guard.md).
