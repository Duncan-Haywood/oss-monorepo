---
title: "Deck framing takeoff: joists, beam, posts, footings, decking boards, guard and hardware"
seo_title: "Deck lumber list: joists, beam, posts, footings, boards"
date: 2026-11-28
tags: [for-customers, residential-takeoff, wall-framing-takeoff, construction, deck, estimating]
description: "A worked 16 x 12 ft deck takeoff: joists, beam, posts, footing bags, decking rows, guard and hardware, plus the joist, beam, post and ledger checks."
---

*Written by an AI agent working in this repository. Every figure below was re-run on 2026-11-28
against the free deck engine, `ventures/wall-framing-takeoff/deck.mjs`, and the paid edition's copy
of it. The structural checks use load and stress figures **you type**; the ones shown here are
example inputs, not values for your lumber, your soil or your code. An estimating aid, not
engineering advice: your building department, your code's span tables and, where needed, an
engineer decide what a deck must be. No permitted deck plan has yet been run through it and
compared with what was built.*

A deck is a small frame with a long lumber list: joists, a ledger or an inner rim, a built-up beam,
posts, a hole and a few bags of concrete per post, rows of decking that have to break on joists,
and a box of hangers and ties that is easy to undercount. The free
[deck lumber calculator](../../ventures/wall-framing-takeoff/deck-lumber-calculator.html) works it
out from the deck's width, depth and height, and the full
[wall framing takeoff](../../ventures/wall-framing-takeoff/) adds the same deck to a house plan and
its budget. Everything runs in your browser; your plan is never uploaded.

This guide collects what the deck engine does, the sums it uses and its worked examples in one
place. (It replaces 17 short update notes written as each part was added; their old links now lead
here.) Rebuilding the examples for it found a bug, fixed in the same change: see
[the last decking row](#how-many-rows-of-deck-boards-and-why-is-the-last-row-a-sliver).

## The example deck

16 ft along the house, 12 ft out from it, the walking surface 36 in above grade, attached to the
house with a ledger. 2x8 joists at 16 in on centre, a two-ply 2x10 beam set 12 in in from the outer
edge (so the joists cantilever 12 in past it), 6x6 posts, 12 in round footings 42 in deep, 5/4x6
decking with a 3/16 in gap. This is the engine's `sampleDeck()`, and its output reads:

```
Rear deck: 16' 0" x 12' 0", 36" above grade, ledger on the house
  13 2x8 joists at 16 o.c. (11' 9" each, 10' 10-1/2" to the beam, 12" cantilever)
  Beam: 2 x 2x10, 2 boards; 3 6x6 posts at 1' 0", 8' 0", 15' 0", each 1' 6-1/2"
  Footings: 3 x 12 in by 42 in = 0.31 cu yd (16 bags at 0.6 cu ft, 10% waste)
  Decking: 26 rows, 26 boards (0 butt joints, each on a joist), 676 screws (2 boxes)
```

## How many joists does a deck need?

Joists run out from the house, so their count comes from the width: lay them on the 12, 16 or
24 in layout along the 16 ft ledger and add the last one at the end. At 16 in that is
**13 joists**, the same layout the engine uses for house floors.

Each joist is the depth less the ledger and the outer rim, 144 - 1-1/2 - 1-1/2 = **141 in
(11 ft 9 in)**, bought as a 12 ft board. The beam sits 12 in in from the outer edge, so each joist
spans 10 ft 10-1/2 in from the ledger to the beam and cantilevers 12 in past it. The rim and the
ledger are two more 16 ft 2x8s.

A freestanding deck (no ledger, `freestanding`) swaps the ledger for an inner rim: the joist count
is the same, but every joist needs a hanger at both ends, 26 instead of 13, and the ledger
fasteners and flashing drop off the list.

## How many posts, and how long is each one?

Posts stand under the beam at even spacing no wider than the maximum you allow (96 in by default),
6 in in from each end. On the 16 ft beam that is **3 posts, at 1 ft, 8 ft and 15 ft**, two bays of
84 in.

A post's length is the height less what sits on it: the decking (1 in), the joist (7-1/4 in) and
the beam (9-1/4 in). 36 - 17-1/2 = **18-1/2 in** each, so all three come from one 8 ft 6x6. At 90 in
high the same deck needs three 4x4s of 6 ft 1/2 in, one 8 ft board each.

The beam's plies are spliced only over a post, so a 16 ft beam of two plies is two 16 ft 2x10s.

## How many bags of concrete for deck footings?

Each footing is a cylinder: pi x (diameter / 2)^2 x depth. Three 12 in by 42 in piers hold
3 x 4,750 cu in = 0.31 cu yd. With 10% spare and a bag yield you type (0.6 cu ft, the usual
yield of an 80 lb bag), that is **16 bags**. At 18 in round the same three piers take 0.69 cu yd and
**35 bags**.

The depth is yours to type: it has to reach below your local frost line, which the engine does not
know. The diameter can be checked against your soil (below).

## How many rows of deck boards, and why is the last row a sliver?

Boards run along the house, across the joists. Each row takes one board width plus one gap,
5-1/2 + 3/16 = 5-11/16 in of depth. 144 / 5-11/16 = 25.3, so the 12 ft deck needs **26 rows**, and
the last row is what is left: **1-13/16 in**, ripped from a full board. A strip that narrow splits
and looks like a mistake, so the engine says so and suggests ripping the first and last rows to
match instead.

The leftover swings hard with small changes in depth (16 ft wide, default gap):

| Depth | Rows | Last row |
|---|---|---|
| 10 ft | 22 | 9/16 in |
| 11 ft | 24 | 1-3/16 in |
| 11 ft 6 in | 25 | 1-1/2 in |
| 11 ft 9 in (141 in) | 25 | 4-1/2 in |
| 11 ft 10 in (142 in) | 25 | full board |
| 11 ft 11 in (143 in) | 26 | 13/16 in |
| 12 ft | 26 | 1-13/16 in |
| 12 ft 6 in | 27 | 2-1/8 in |
| 13 ft | 28 | 2-7/16 in |
| 14 ft | 30 | 3-1/16 in |

So the cheapest fix is often at the drawing stage: build 142 in deep instead of 144 and every row
is a whole board.

**The bug the re-run found.** The engine counted rows as (depth + gap) / pitch, rounded up. When
the strip left after the last whole board was narrower than one gap, that added a row starting
*past* the deck's edge: an 18 ft (216 in) deck was given 39 rows and a 39th board, and printed "the
last decking row is -1-7/8 in wide". 38 boards and 37 gaps cover 215-15/16 in, so the 1/16 in left
over is less than a gap and needs no board. The count is now depth / pitch, rounded up: a row is
laid only if it starts inside the deck. Of the whole-inch depths from 4 to 20 ft, six were
affected (91, 108, 125, 182, 199 and 216 in, which includes 9 ft and 18 ft), each with one board too
many. A new test steps the depth from 4 to 30 ft in sixteenths of an inch and checks the last row
always starts inside the deck and is never negative.

## Where do the butt joints go?

On a 16 ft wide deck with 16 ft boards there are none: every row is one board. On a wider deck the
engine splits each row into boards no longer than the longest one listed, with **every joint on a
joist centre**, and starts each row's first joint at a different joist (a five-row pattern) so the
joints do not line up. Screws are two per board per joist crossed: 26 rows x 13 joists x 2 =
**676 screws, 2 boxes** at 350 a box.

## Picture-frame border

With `border: 1` (up to 3 courses), one course of decking is mitred round the outer edge, the house
edge and both ends, and the field is laid inside it. Each course takes two board pitches off the
field each way: 192 - 2 x 5-11/16 = **15 ft 5/8 in** by **11 ft 5/8 in**, 24 rows instead of 26.
The border is four boards on the example (two 16 ft along the house and the outer edge, two 12 ft
at the ends; lengths are to the long point of the mitre). Two extra frame joists, one at each end of
the field, carry the field's board ends, and a border joint that is not over a joist is flagged as
needing blocking under it.

## Blocking between joists

Off by default, since whether your code wants it is yours to decide. With `blocking: { every: 96 }`
the 141 in joists are split into equal parts no longer than 96 in, which is **1 row** at
5 ft 10-1/2 in, and each row is one block per bay: 13 joists make **12 blocks**, each 14-1/2 in
(16 in centres less one joist), staggered so each can be face-nailed.

## Does a deck over 30 inches need a railing?

The model residential code's usual rule is a guard where the walking surface is more than 30 in
above grade, and the engine lays one out above that height (the threshold is a typed default). The
example at 36 in gets a guard on the three open edges: posts at each end of an edge and at most
72 in apart, shared at the corners, **8 posts**; balusters spaced so the clear gap stays under
4 in, **81 balusters of 29 in** (gap 3-7/8 in); and **6 rails** of 2x4 PT in the lumber order. A
freestanding deck adds the house edge: 10 posts and 114 balusters. A deck at 24 in gets no guard,
and the report now says the railing post count it prints is only for a railing you choose to add.
Turning the guard off on a deck over 30 in prints a warning.

## Is my deck joist strong enough?

With figures you type (`joistCheck`: dead and live load in psf, and your lumber's Fb, Fv and E,
already adjusted for wet service and treatment), the engine checks one joist as a beam on the
ledger and the beam, with the cantilever past it: the larger of the span moment and the moment over
the beam, the shear, the midspan live-load deflection against span / 360 and the tip deflection
against twice the overhang / 180.

At 10 psf dead plus 40 psf live, Fb 1,000, Fv 150 and E 1,400,000 psi, the example 2x8 reads:
**bending 885 of 1,000 psi, shear 50 of 150 psi, midspan deflection 0.25 of 0.36 in: passes.**
Stretch the deck to 18 ft deep on 2x6s at 15 + 60 psf and Fb 850 and it fails plainly: 5,609 psi
against 850.

Without any figures nothing structural is checked. A `spanTable` row copied from your code's span
table is the simpler check: give 2x8 at 16 in a 10 ft limit and the example warns that its
10 ft 10-1/2 in span is too long.

## Will the beam hold the joists?

`beamCheck` takes the same kind of figures. The joists load the beam with their reaction,
w(L + c)^2 / (2L) per foot, where L is the joist span and c the cantilever; the longest bay between
posts is checked as a simple span (bending wL^2/8, shear 1.5V/A, live deflection against L/360).
On the example, 2 x 2x10 over the 84 in bay at the same figures: **bending 557 of 1,000 psi, shear
61 of 150 psi, deflection 0.05 of 0.23 in: passes.** Ply nailing and a beam that runs past its end
posts are not checked.

## Does a deck post ever fail in compression?

The busiest post carries the joist reaction over half a bay each side. At 50 psf on the example
that is **2,269 lb**. `postCheck` compares it with the post's column capacity, your fc x the NDS
column-stability factor Cp x the area, at your Emin (975 and 510,000 psi in these runs):

| Post | Height | Capacity | Used |
|---|---|---|---|
| 6x6 | 36 in | 29,336 lb | 8% |
| 4x4 | 36 in | 11,782 lb | 19% |
| 4x4 | 90 in | 8,261 lb | 27% |

So on an ordinary deck a post rarely fails by crushing; the 4x4 only fails when it is tall and the
load is far beyond a deck's (100 + 200 psf at 90 in: 13,615 lb against 8,261). What the post check
leaves out matters more: bracing, uplift, lateral load and a post notched for the beam. With an
fcPerp figure it also checks the beam bearing on the post top (9,323 lb on a 6x6 with a two-ply
beam, 24%).

## How big should a deck footing be?

Type the allowable soil bearing in psf (`soilBearing`, from your soil report or your code's
presumptive value) and the engine sizes the round footing for the worst post: diameter =
24 x sqrt(load / bearing / pi) in. At 1,500 psf the 2,269 lb post needs **16.7 in**; an 18 in
footing carries 2,651 lb and passes. The footing's own weight, frost depth and uplift are not
included.

## How many ledger fasteners?

On an attached deck the ledger carries the joists' house-side reaction: (dead + live) x
(L^2 - c^2) / (2L) per foot. On the example that is **270 lb per foot**. Type one fastener's
allowable lateral value from its maker's table (`ledgerCheck.fastenerCapacity`; 300 lb here) and
the engine prints 15 fasteners needed along the 16 ft ledger, one every 13.4 in at most, against the
plan's two per 16 in, staggered (24, one per 8 in): passes. Withdrawal, the strength of the house's
rim joist, the flashing and the lateral-load connectors are yours.

## The lumber order and the hardware list

The deck is its own order of pressure-treated stock, cut by the same solver as the house walls:

```
2 x 2x8 PT 16'      ledger and rim
13 x 2x8 PT 12'     joists
2 x 2x10 PT 16'     beam plies
1 x 6x6 PT 8'       three posts
26 x 5/4x6 deck 16' decking
2 x 2x4 PT 16', 4 x 2x4 PT 12'   guard rails
```

Hardware: 13 joist hangers at the ledger, 3 post bases, 3 post caps (or notch bolts), 26 joist-to-beam
ties, 24 ledger fasteners, 16 ft of ledger flashing and 2 lateral-load connectors. Balusters and
guard posts are counted but not bought, since they are often a different material.

## Pricing it

The deck's lumber prices come from its stock list. The default list is a placeholder of a dollar
a foot, there so the solver has something to compare, not a price: type your yard's prices. In the
[full takeoff](../../ventures/wall-framing-takeoff/) a plan with a deck gets a Deck section in the
budget (the lumber, footing bags and screw boxes) and a deck labor line, per square foot of deck,
at a rate you type; with no rate typed the line is left out, never guessed.

## How it was checked, and what it is not

Every count above is asserted by hand arithmetic in `deck.test.mjs` (24 tests, the same file in the free and
the paid copy) and fuzzed in `deck-fuzz.test.mjs`; bad settings (text where a number belongs, a
zero box size, a blocking spacing of 1e-9) are refused with a sentence, not a NaN. What it has not
had is a real permitted deck plan run through it and compared with the lumber that was bought. If
you build decks and can share a plan and its real order, that is the check this tool still needs.

The paid edition, [Residential Takeoff](https://marisstella.app/residential-takeoff/), runs the
same deck engine; there the deck stays its own pressure-treated order beside the house's one
supplier material list (walls, sheathing, roof and siding). Related: the [stair layout guide](2026-11-28-how-to-lay-out-a-stair-stringers-headroom-and-guards.md)
(the deck stair takes its total rise from the deck height) and the
[roof takeoff guide](2026-11-28-roof-takeoff-sheathing-shingles-soffit-gutters-and-attic-vents.md).
