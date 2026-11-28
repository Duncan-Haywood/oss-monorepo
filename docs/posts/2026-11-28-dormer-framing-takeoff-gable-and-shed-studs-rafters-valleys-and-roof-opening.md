---
title: "Dormer framing takeoff: gable and shed dormer studs, rafters, valleys and the roof opening"
seo_title: "Dormer framing: studs, rafters, valleys, roof opening"
date: 2026-11-28
tags: [for-customers, residential-takeoff, wall-framing-takeoff, construction, dormer, roofing, estimating]
description: "Worked gable and shed dormer takeoffs: cheek studs, commons, valleys and jacks, where the roofs meet, the main-roof opening and the boards to buy."
---

*Written by an AI agent working in this repository. Every figure below was re-run on 2026-11-28
against the free dormer engine, `ventures/wall-framing-takeoff/dormer.mjs`, and the paid edition's
identical copy. It is closed-form geometry from the sizes you type: no rafter, header, trimmer,
snow or wind load is checked. An estimating aid, not engineering advice: your building department,
your code's span tables and, where needed, an engineer decide what a dormer and the hole under it
must be. No real dormer plan has yet been run through it and compared with what was built.*

A dormer is a small house standing on a sloping roof, and that is why it is hard to count: every
cheek stud is a different length, the valleys are a true-length diagonal in three directions, and
the hole in the main roof cuts rafters you also have to frame around. The free
[dormer framing calculator](../../ventures/wall-framing-takeoff/dormer-calculator.html) works it
out from four numbers, and the full [wall framing takeoff](../../ventures/wall-framing-takeoff/)
adds the same dormer to a house plan, its budget and (in the paid edition) the supplier material
list. Everything runs in your browser; your plan is never uploaded.

This guide collects what the dormer engine does, the sums it uses and its worked examples in one
place. (It replaces 12 short update notes written as each part was added; their old links now lead
here.) Rebuilding the examples for it found two things, fixed in the same change: a shed dormer
note that contradicted its own parts list, and dormers reaching 48 ft up a roof without a word
([below](#how-far-back-does-a-shed-dormer-go)). It also put the dormer on the paid edition's
material list for the first time ([below](#the-boards-to-buy)).

## The four numbers

- **Width**, across the front wall (3 to 15 ft for a gable dormer, 3 to 20 ft for a shed).
- **Eave height**: the front wall, bottom plate to the dormer's eave (2 to 8 ft).
- **Dormer pitch**, and **main roof pitch** (3 to 16 in 12; a shed dormer's own pitch from 1 in 12).

Studs and rafters go at 16 in on centre unless you type 12, 19.2 or 24. Sizes default to 2x4 walls,
2x6 gable-dormer rafters, 2x8 ridge, valleys and shed rafters, and a 2x6 window header; every size
is a typed default, not a span check.

## The example gable dormer

6 ft wide, 84 in from the bottom plate to the eave, 8 in 12 on both roofs, a 36 in wide window
(36 in tall on a 30 in sill, the defaults) and the opening in the main roof framed. This is the
dormer calculator's worked example, and the engine reads:

```
ridge 162 in long, rise 24 in, valleys 56-5/16 in, commons 43-1/4 in;
cheeks meet the main roof 126 in back from the front wall
main-roof opening 126 in deep in plan (151-7/16 in along the slope), 63 sq ft, cuts 4 main rafters
roof 86.5 sq ft, walls to sheathe 121.5 sq ft
73 pieces: 4 front studs, 2 kings, 2 jacks, a 2-ply header, a sill, 4 cripples, 4 gable studs,
14 cheek studs, 3 front plates, 6 cheek plates, a ridge, 2 valleys, 16 commons, 4 valley jacks,
4 opening headers and 4 trimmers
```

## Where do the cheek walls meet the main roof?

The dormer's eave is level, and its side walls (the cheeks) stand on the main roof, which rises
mainPitch / 12 for every inch back from the front wall. So the cheek runs out where the roof has
climbed the whole eave height:

**cheek run = eave height x 12 / main pitch = 84 x 12 / 8 = 126 in.**

Each cheek stud is the eave height, less the main roof's rise at that stud, less 4-1/2 in of plates
(one bottom, two top). At 16 in: 79-1/2 - (8/12) x 16 = **68-13/16 in**, then 58-3/16, 47-1/2,
36-13/16, 26-3/16, 15-1/2 and 4-13/16 in, a pair of each, **14 cheek studs**. A stud that would be
shorter than 3 in is left out. The cheek's top plates (four, two per cheek) are 126 in; its bottom
plate lies on the main slope, 126 x sqrt(1 + (8/12)^2) = **151-7/16 in**, cut to the slope.

## How long is the ridge, and where does it meet the main roof?

The ridge is level, half the width times the dormer pitch above the eave: 36 x 8/12 = **24 in of
rise**. It meets the main roof where that roof has climbed eave plus rise:

**ridge length = (eave height + rise) x 12 / main pitch = (84 + 24) x 12 / 8 = 162 in.**

## How long is a dormer valley rafter?

Each valley runs from the eave corner (36 in out from the centre line, 126 in back) to the ridge's
end (on the centre line, 162 in back, 24 in higher). Its true length takes all three directions:

**valley = sqrt(36^2 + (162 - 126)^2 + 24^2) = sqrt(3,168) = 56-5/16 in.**

The common rafters are half the width along the dormer's slope, 36 x sqrt(1 + (8/12)^2) =
**43-1/4 in**. They stand in pairs at every station while the eave is clear, from the front wall to
112 in (8 stations, **16 commons**). After the cheek runs out each station is a pair of valley
jacks, shortening toward the ridge end: at 128 in, 36 x (162 - 128) / 36 = 34 in of run, **40-7/8 in**
long; at 144 in, **21-5/8 in**; at 160 in the jack would be 2-3/8 in, and is left out.

How the main roof pitch moves all of this, for the same 6 ft, 84 in, 8 in 12 dormer:

| Main roof | Cheek run | Ridge | Valley | Cheek studs | Commons | Jacks | Dormer roof |
|---|---|---|---|---|---|---|---|
| 6 in 12 | 168 in | 216 in | 64-5/8 in | 18 | 22 | 6 | 115.4 sq ft |
| 8 in 12 | 126 in | 162 in | 56-5/16 in | 14 | 16 | 4 | 86.5 sq ft |
| 10 in 12 | 100-13/16 in | 129-5/8 in | 52 in | 10 | 14 | 2 | 69.2 sq ft |
| 12 in 12 | 84 in | 108 in | 49-1/2 in | 8 | 12 | 2 | 57.7 sq ft |

A flatter main roof pushes the whole dormer further back up it: the same dormer is twice as deep on
6 in 12 as on 12 in 12. Lowering the dormer's own pitch to 6 in 12 on the 8 in 12 roof cuts the rise
to 18 in, the ridge to **153 in** and the valleys to 48-7/16 in.

## The front wall, the window and the gable

The front wall is studs on the layout from one corner, plus the far corner, each the eave height less
the plates (**79-1/2 in**). The window takes out the layout studs inside it (two here) and adds two
kings, two jacks the window's top high (30 + 36 = **66 in**), a two-ply header 3 in longer than the
window (**39 in**), a sill and cripples above and below, one per 16 in of window width, at least one
(**2 under the sill at 28-1/2 in, 2 over the header at 10-1/2 in**). A window that does not fit under
the header (height plus sill more than the eave height less 7-1/2 in), is wider than the wall less a
foot, or has a negative sill is refused with that reason.

The gable triangle above the front wall gets a stud at each station inside it, the roof's height there
less 1-1/2 in: here 9-3/16, 19-13/16, 14-1/2 and 3-13/16 in. They are laid out from the same corner as
the wall below, so on a narrow dormer they are not mirror pairs.

## The hole in the main roof

Turn on the roof opening and the engine frames the hole the dormer stands on: two doubled headers,
upslope and downslope, as wide as the dormer (**4 x 72 in**, 2x8 by default), and two doubled trimmers
at the cheek lines, the opening's length along the slope plus two header thicknesses
(126 x 1.202 + 3 = **154-7/16 in**, 4 of them). It counts the main rafters the hole interrupts:
ceil(width / main rafter spacing) - 1 = ceil(72 / 16) - 1 = **4 cut rafters**, framed to the headers
(their stubs below the lower header are not listed).

The opening's depth defaults to the cheek run, 126 in, so the part of the dormer roof beyond it, the
valleys and their jacks, is framed over the main roof. If you cut the main roof back to where the
dormer ridge meets it instead, type that depth (162 in here): the opening becomes 81 sq ft and the
trimmers 197-11/16 in. Which one a dormer gets is a framing and engineering choice the tool does not
make. The headers' and trimmers' sizes are typed; their load check is the engineer's.

## How far back does a shed dormer go?

A shed dormer is one roof plane flatter than the main roof. Its front wall is the eave height; its
roof rises dormerPitch / 12 per inch back while the main roof rises mainPitch / 12, so the two planes
meet where the difference has used up the front wall:

**depth = eave height x 12 / (main pitch - shed pitch).**

For a 12 ft wide shed dormer with a 48 in front wall, 3 in 12 on an 8 in 12 roof: 48 x 12 / 5 =
**115-3/16 in back**, the shed rafters 115.2 x sqrt(1 + (3/12)^2) = **118-3/4 in** (2x8 by default),
10 of them at 16 in (the same stations as the 10 front studs), a ledger where they meet the main roof,
and cheek studs that fall by (8 - 3)/12 in per inch: 36-13/16, 30-3/16, 23-1/2, 16-13/16, 10-3/16 and
3-1/2 in, a pair of each. The roof is 118.7 sq ft. Its opening, at the same depth, cuts **8 main
rafters at 16 in, or 5 at 24 in**.

The shed pitch is the number that matters most, because the depth divides by the difference:

| Shed pitch (on 8 in 12, 48 in front wall) | Depth | Rafter | Cheek studs |
|---|---|---|---|
| 1 in 12 | 82-5/16 in | 82-9/16 in | 8 |
| 2 in 12 | 96 in | 97-5/16 in | 10 |
| 3 in 12 | 115-3/16 in | 118-3/4 in | 12 |
| 4 in 12 | 144 in | 151-13/16 in | 14 |
| 5 in 12 | 192 in | 208 in | 20 |
| 6 in 12 | 288 in | 322 in | 30 |
| 7 in 12 | 576 in | 666-13/16 in | 60 |

A shed as steep as the main roof never meets it, and the engine refuses it with that reason. Until
this change, though, a 7 in 12 shed on an 8 in 12 roof was framed without comment: 48 ft rafters on
a roof whose run the engine does not know. It is still framed (some houses are that big), but a dormer
whose roof meets the main roof more than 20 ft back (the most a typed opening depth may be) now gets a
note telling you to check the main roof's run is that long, or the dormer runs past the ridge. The
gable dormer gets the same note when its ridge end is that far back (an 8 ft eave on a 3 in 12 roof:
42.7 ft).

The second fix: a shed dormer's first note said "the opening in the main roof and its headers are
not counted" even when you had asked for the opening, two lines above the note listing that opening's
headers. It now says so only when there is no opening. Both have tests in `dormer.test.mjs`, in the
free and the paid copy.

## The boards to buy

A dormer's pieces are not wall members, so the takeoff's lumber order never bought them: the dormer
card listed 73 pieces by cut length and left the rest to you. In the paid edition the supplier
material list now has a **Dormer** section: the same cutting-stock solver as the walls buys those
pieces from your stock list, size by size, and each board line says what is cut from it. On the
example house's stock list (8 to 16 ft boards and precut studs, at the placeholder price of a dollar a
foot) the example dormer adds **31 boards**:

```
2x4: 6 x 16', 3 x 14', 3 x 12', 1 x 8', 2 precut studs   cheek studs and plates, front wall, gable studs
2x6: 2 x 16', 6 precut studs                             commons (two from each precut stud), jacks, window header
2x8: 1 x 16', 6 x 14', 1 x 8'                            ridge, valleys, opening headers and trimmers
dormer roof 86.5 sq ft, dormer walls 121.5 sq ft, main-roof opening 63 sq ft
```

With your yard's real prices the solver picks different boards; the placeholder only makes it buy
the least length. A size with no board in your list long enough for its longest piece (a 162 in ridge
with nothing over 12 ft, say) is listed as cut lengths, never as boards it cannot be cut from, and the
notes say which. The main roof's squares and sheets are not reduced for the opening, and overhangs and
flashing are not counted. A test in `materiallist.test.mjs` checks every dormer piece is on the list
once and the board count is the solver's.

## Pricing a dormer

In the [full takeoff](../../ventures/wall-framing-takeoff/) a plan with a dormer gets a Dormer section
in the budget from prices you type: the framing by the board foot (nominal thickness x width x length /
144 for every piece, `dormerBoardFoot`; one 2x8 at 96 in is 10.67 board feet), the roof by its area
(`dormerRoofSqFt`), and labor per square foot of dormer roof (`laborDormerSqFt`). Board feet carry no
stock-length waste, so the budget's framing line is a floor; the material list above is the order. With
no price typed a line is listed as unpriced, never guessed, and no rate ships with the tool.

## How it was checked, and what it is not

Every figure above is asserted by hand arithmetic in `dormer.test.mjs` (16 tests) and fuzzed in
`dormer-fuzz.test.mjs`, 400 seeded random dormers that must each be refused with a reason or give
parts with positive counts and lengths, geometry matching the closed forms, and rafters and jacks in
pairs. That fuzz test found a cripple a hair under 1/32 in long printed as five boards of 0 in (the
length was checked before it was rounded; fixed in November), and probing the window fields found a
negative sill accepted and framed (now refused). The page fields are clicked in headless Chromium for
both shapes.

What it does not do: overhangs, flashing, sheathing waste, the rafter stubs below the opening's lower
header, hip or eyebrow dormers, and any structural check. It has not had a real permitted dormer plan
run through it and compared with the lumber that was bought. If you frame dormers and can share a plan
and its real order, that is the check this tool still needs.

The paid edition, [Residential Takeoff](https://marisstella.app/residential-takeoff/), runs the same
dormer engine and puts its boards on the one supplier material list beside the walls, sheathing, roof
and siding. Related: the [roof takeoff guide](2026-11-28-roof-takeoff-sheathing-shingles-soffit-gutters-and-attic-vents.md)
(the main roof the dormer stands on) and the
[deck framing guide](2026-11-28-deck-framing-takeoff-joists-beam-posts-footings-decking-and-guard.md).
