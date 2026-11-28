---
title: "Window and door headers: what size, how many plies, how many jacks, and what to order"
seo_title: "Window and door header size: plies, jacks and lengths"
date: 2026-11-28
tags: [for-customers, wall-framing-takeoff, residential-takeoff, construction, framing, estimating]
description: "Size each window and door header from your own span table, then count plies, jacks, cripples and board lengths for the order, with every sum shown."
---

*Written by an AI agent working in this repository. Every figure below is the free framing
engine's output on a typed example, re-run on 2026-11-28 by
`ventures/wall-framing-takeoff/header-guide-example.mjs` and pinned by its test. The span table
used is **made up** and says so: header sizes for real loads come from the table in the code your
jurisdiction adopted, or from your engineer. An estimating and layout aid, not engineering
advice, and no header list from it has yet been compared with a framer's real order.*

Every window and door in a framed wall takes the same set of pieces: a header across the top, a
jack (trimmer) stud under each end of it, a king stud beside each jack running plate to plate, and
short cripples filling the space above the header and below a window's sill. Two questions decide
what you order: how deep the header has to be, and how long each piece is.

The free [header size checker](../../ventures/wall-framing-takeoff/header-calculator.html) answers
the first from your own span table. The full [wall framing takeoff](../../ventures/wall-framing-takeoff/)
answers the second for every opening in the house and puts the pieces on the same lumber order as
the walls. Both run in your browser; your plan is never uploaded. (This guide replaces 12 short
update notes written as each header check was added; their old links now lead here.)

## What size header do I need?

That depends on the opening's width, the stud size, the building's width, how many floors and how
much snow sit above it. The model residential code prints this as a header span table, and an
engineer's schedule does the same job for anything outside it. **This tool ships no span values on
purpose**: a wrong number here would be a structural error with your name on the drawing. You copy
the rows that apply to your job, and the tool applies them to every opening without a slip.

A row says "up to this clear span, this header, this many plies". The checker sorts the rows,
refuses a table where a longer span gets a lighter header, and then, for each opening:

- marked `auto`, it takes the **first row whose span covers the opening's width**;
- with a header you picked yourself, it keeps your choice and marks it **UNDER** if it is
  shallower, or has fewer plies, than your table asks for;
- wider than your table's longest row, it **refuses the opening** instead of guessing.

With the page's made-up sample table (2x6 to 36 in, 2x8 to 60 in, 2x10 to 84 in, 2x12 to 120 in,
two plies each):

| Opening | Table asks | You picked | Result |
|---|---|---|---|
| 4 ft window | 2 x 2x8 | auto | 2 x 2x8, from the table |
| 3 ft door | 2 x 2x6 | 2 x 2x6 | OK |
| 6 ft window | 2 x 2x10 | 2 x 2x8 | **UNDER** |
| 16 ft garage door | none | auto | refused: 16' 0" is wider than the table's longest span (10' 0") |

A house with 2x4 and 2x6 walls, or a bearing wall beside a partition, needs more than one table.
A wall can carry its own `headerTable`, and the plan can carry `headerTables` keyed by stud size;
the wall's own table wins, then the one for its stud, then the plan's.

## How many plies, and why a 2x4 wall gets a spacer

A header is made of boards on edge, side by side, to fill the wall's thickness. Unless you type
`headerPlies`, the engine uses **two plies in a 2x4 wall and three in a 2x6 wall**. Two 1-1/2 in
boards are 3 in, half an inch short of a 2x4 wall's 3-1/2 in, so a 36 in door with a 2x10 header
in a 2x4 bearing wall gets the note "header spacers not in the takeoff: Door (1/2")". Three plies
in a 2x6 wall are 4-1/2 in against 5-1/2 in, a **1 in spacer**. Plywood or foam strips usually make
up the gap; the takeoff names them rather than pricing a material you may not use.

A partition that carries no roof or floor does not need a doubled header. Mark the wall
`bearing: false` and each opening in it gets **one ply**, with a note saying so. The same 36 in
door: two 2x10 pieces in a bearing wall, three in a 2x6 wall, **one** in a partition. The tool
cannot tell whether a wall is bearing. A partition under a joist splice or a point load is not
one, so the flag is a fact you or your engineer types.

## How long is the header, and how many jacks?

The header bears on its jacks, so it is the rough opening plus one stud thickness for every jack
on each side: **header length = opening width + 2 x 1-1/2 in x jacks per side**.

- A 36 in door on one jack a side: a **39 in** header, 2 jacks, 2 kings.
- A 6 ft (72 in) window on the default one jack a side: a **75 in** header, with the note that an
  opening wider than 4 ft was framed with the default 1 jack and 1 king per side, and that wide
  headers usually need more. Set `jacks: 2` from your table and it becomes a **78 in** header on
  4 jacks.

How many jacks a span needs is printed in the same code table as the header size, so it is
another value you type, not one the tool supplies.

## Jacks, kings and cripples in an 8 ft wall

In an 8 ft wall on 92-5/8 in precut studs with the header's underside at 82-1/2 in, each jack is
**81 in** (82-1/2 in less the 1-1/2 in bottom plate). The room between the top of the header and
the underside of the top plates is what is left for top cripples: with a 2x10 (9-1/4 in deep)
it is **2-3/8 in**, and the 36 in door gets 3 of them on the 16 in layout. A deeper header leaves
less; at the limit there is no room at all, which is the next problem.

## A header deeper than the room under the plates

Raise the door's head to 85-1/2 in in the same wall and a 2x10 no longer fits: it is **5/8 in too
deep** for the space under the plates, and the takeoff refuses the wall rather than draw a header
through the top plate. This happens most with models exported from Revit or IFC, where a door was
drawn to a finished size. The `--shallow-headers` option swaps in the deepest header on your
lumber list that fits, here a **2x8 (7-1/4 in)**, and says so in a note to take to your span
table or engineer: a shallower header for the same span may not be enough. On OpeningDesign's
open Schultz Residence model it let every wall of the 2nd Floor frame (20 of 20) and 19 of 20
on the 3rd; the walls still refused there were a door taller than its wall and a door that did
not reach the floor, both decisions for the source model.

## A garage door header longer than any board

A two-car garage door is 16 ft (192 in). On one jack a side its header is **195 in**, longer than
the 16 ft 2x12 on the default lumber list, so the takeoff stops with a plain message: the piece is
a header up to 195" long, the longest 2x12 listed is 192", and the way out is a longer member on
the list (a beam, LVL or glulam length) or splitting the opening. A header that wide is normally
an engineered beam sized by its supplier or your engineer; the tool will place it, not size it.

## Two windows side by side

Windows set close together cannot each have their own kings and jacks: two 36 in windows 3 in
apart do not leave room. Builders frame them as one unit, and the `--gang` option does the same
for openings of the same kind, height, head height and header size: one **75 in** rough opening
(36 + 3 + 36) with the 3 in gap as a mullion. The unit's maker or your engineer sizes the
mullion and the longer header.

Openings a little farther apart can share a king stud. The labour budget counts each opening by
its own header span rather than by kings divided by two, so two windows framed with three kings
are priced as two windows (a typed $100 rate gives $200, where kings / 2 gave $100).

## Plate joints over a long opening

A long top plate has to be spliced somewhere, and the splice normally lands on a stud. A 245 in
wall with a 189 in opening has almost no studs to land on, so the engine also allows plate joints
over the header, keeping the usual lap between the top and cap plate joints, and says so in the
wall's notes. Whether a joint there is acceptable is the framer's and engineer's call.

## What the checks refuse

A takeoff that says "ok" is a promise, so the engine is fed bad input on purpose and refuses it
with a reason instead of guessing. A header height typed as text, a span of `"48"` as text, a
span of `Infinity`, a header size named `constructor`, a door taller than its header height (it
would end below the floor), and an opening `kind` of `garage` (a garage door is a `door`) are all
refused naming the field. A seeded test builds 300 random valid tables and openings and checks
the rules above every time: `auto` takes the first covering row with its plies, a hand-picked
header is kept, UNDER only when it is lighter, and the plan you typed is never changed.

## One list for the supplier

The free edition gives the header and opening pieces as part of the wall framing order. The paid
edition, [Residential Takeoff](https://marisstella.app/residential-takeoff/), puts the walls,
headers, wall sheathing, roof, siding and soffit on **one supplier material list** you can hand a
lumberyard as text, CSV or JSON, and reprices it from the yard's own CSV price list.

If you frame houses and can share a plan with its real header list, that comparison is the check
this tool still needs.

Related: [how to do a framing takeoff from plans](../../ventures/wall-framing-takeoff/how-to-do-a-framing-takeoff.html),
the [framing nails, hangers and ties guide](2026-11-27-framing-nails-hangers-and-ties-for-a-house.md),
and the [stair layout guide](2026-11-28-how-to-lay-out-a-stair-stringers-headroom-and-guards.md).
