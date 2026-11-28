---
title: "How wrong is one stud per foot, and how much waste to add? Measured on three houses"
seo_title: "Framing lumber waste factor and the stud-per-foot rule, measured"
date: 2026-11-04
updated: 2026-11-28
description: "A counted framing order against the one-stud-per-foot rule, the cutting waste in a framing order, and hip vs. gable sheathing and shingle waste, measured."
tags: [wall-framing-takeoff, for-customers, construction, framing, estimating]
---

# How wrong is one stud per foot?

The rule of thumb for a framing order is one stud per linear foot of wall plus
plates. We set it against a counted order from the wall framing takeoff tool on
one invented house and two generated ones (lineal feet of 2x4 and 2x6, 10% waste
on every column).

At 16 inches on center the rule orders 1.9 to 10.2% more lumber than the counted
order. It cannot know the spacing, so at 24 inches it is 17 to 27% high on the
same houses, and at 12 inches it is 5 to 8% short. A spreadsheet formula that
follows the spacing but allows four studs per opening stays 16 to 29% high.

These are two generated plans and one invented house, not a builder's real
order, so they show how the rules behave rather than what a crew over-orders.
The full tables are on the new comparison page,
`ventures/wall-framing-takeoff/vs-stud-per-foot-rule.html`, and come from
`allowance-bench.mjs` in the same folder.

## How much waste to add (2026-11-28)

The 10% waste on every column above is a flat allowance. It covers two
different things: the offcuts left when pieces are cut from boards, and the
boards lost to culls, mistakes and theft. Only the first can be worked out from
the plan, so we measured it on the same three houses
(`waste-bench.mjs`), for four ways of buying the same walls:

| Way of buying (16 in on center) | Cutting waste |
|---|---|
| Cut plan, boards of 8 to 16 ft and precut studs | 0.2 to 0.3% |
| Cut plan, the yard sends only 8 and 16 ft and precuts | 1.4 to 1.7% |
| Cut plan, every piece from 16 ft boards | 4.0 to 5.2% |
| No plan: each piece on the shortest board it fits | 20.5 to 29.8% |

At 24 inches on center each figure is a little higher: 0.3 to 0.4%, 2.3 to
2.6%, 5.0 to 5.8% and 18.9 to 26.9%. So with a cut plan almost all of a flat
10% is really a cull and mistake allowance (9.5 to 9.8% of it is left after the
cutting). Without one, 10% runs short before a single board is culled. The
takeoff keeps the two apart: it orders the cut plan and adds the cull share you
type, per lumber size, as spare boards. The cull share is not measured here; it
depends on the grade, the yard and the crew.

The tables are on
`ventures/wall-framing-takeoff/lumber-waste-factor.html`; a test pins every
figure on that page to the benchmark's output.


## One house taken off step by step (2026-11-28)

The counts above are totals. A new guide, "How to do a framing takeoff from plans"
(`ventures/wall-framing-takeoff/how-to-do-a-framing-takeoff.html`), shows where they come from on Open House Plans 1 (CC0, generated: four
exterior and ten interior walls, 220 ft, 8 doors and 10 windows), in the six
steps a framer works a plan set: wall schedule, plates, layout studs, openings,
corners and tees, then the board order.

At 16 inches on center the walls come to 436 pieces: 130 layout and end studs,
35 kings, 36 jacks, 36 header plies, 87 cripples, 10 sills, 32 corner and tee
backing studs and 70 plate pieces. The stud-per-foot rule says 220; the layout
has 197 full-height members plus the jacks and cripples. Packed into board
lengths, that is 276 boards (190 of them precut studs) with 0.35% cutting
waste. At 24 inches the bought length falls 12%.

Every figure on the page is computed by `takeoff-example.mjs` and pinned by its
test, so a change to the engine that moves a count fails until the page is
rerun. Header sizes (2x10 here) and jack counts are inputs, and three doors on
this plan are wider than 4 ft with one jack a side, which a real plan would
usually not allow.
## Roof sheathing: area / 32 plus 10%, against a count (2026-11-28)

The same question for the roof deck. The usual order is the roof's area divided
by 32 square feet (one 4x8 sheet) plus 10%. We counted the sheets course by
course instead, with the roof calculator's engine, on 20 generated gable roofs
(four footprints from 24 x 40 to 36 x 70 ft, pitches 4/12 to 12/12, 12 in
overhangs).

- In 16 of the 20, the rule bought 1 to 8 sheets too many: counted waste was
  3.1 to 7.9%, not 10%.
- In the other 4 it ran 1 to 3 sheets short, and all 4 had the same cause: a
  top course at the ridge between 24.3 and 30.4 in wide. A strip that wide
  cannot share a sheet with a second strip, so nearly half of each of those
  sheets is offcut, and waste rose to 10.7 to 13.3%.

So before ordering, divide each plane's sloped length by 4 ft and look at what
is left: under 2 ft, the rips pair up; just over 2 ft, count one sheet per rip.
The tables, a pitch factor table from 1/12 to 12/12, and what the count leaves
out (hip roofs among them) are on the
[roof sheathing page](https://marisstella.app/wall-framing-takeoff/roof-sheathing-sheets.html);
the [roof calculator](https://marisstella.app/wall-framing-takeoff/roof-calculator.html)
counts your own roof the same way. Generated roofs, not a builder's order.

## Wall sheathing: count the perimeter, keep the windows in (2026-11-28)

And for the exterior walls. The usual order is the wall area (perimeter times
height) over 32 square feet plus 10%, and some estimators take the windows and
doors off first. We counted the sheets panel by panel with the wall sheathing
calculator's engine on four generated houses (40 x 24 to 70 x 36 ft, one
3 x 4 ft window per 12 ft of wall and two doors) at 8, 9 and 10 ft walls.

- Standing up, one sheet tall, the houses took 32, 39, 47 and 55 sheets at
  every wall height: the perimeter over 4 ft, plus 0 to 2. A taller wall
  changes the sheet length, not the count.
- Taking the openings off ran short on all 32 cases, by 2 to 19 sheets. A
  window cut out of a sheet is offcut, not a saving.
- An 8 ft wall on precut studs is 97-1/8 in tall, so 4x8s do not reach the top
  plate. Laid flat, covering that last 1-1/8 in takes a third course and 5 to 7
  sheets more than the area rule; on 10 ft walls a 25-1/8 in top course cost
  7 to 10 more.

The tables are on the
[wall sheathing page](https://marisstella.app/wall-framing-takeoff/wall-sheathing-sheets.html);
the [wall sheathing calculator](https://marisstella.app/wall-framing-takeoff/sheathing-calculator.html)
counts your own house.

## Hip roofs: what the hip offcuts cost (2026-11-28)

The count above leaves hip roofs out. For a hip, a flat 15% is the common
allowance against a gable's 10%. We laid out 4x8 sheets on 16 invented rectangular roofs (24 x
36 to 36 x 60 ft, 4:12 to 10:12, 12 in overhang all round), each as a gable and
as a hip, and counted the sheet area bought over the roof's surface
(`roof-waste-bench.mjs`):

| Layout | Extra over the surface | Average |
|---|---|---|
| Gable | 3.3 to 16.2% | 7.8% |
| Hip, the triangle cut off each course at the hips thrown away | 12.7 to 30.4% | 19.5% |
| Hip, those triangles reused to start or fill other courses | 4.4 to 16.2% | 9.0% |

Thrown away, the hip offcuts cost 4 to 10 more sheets than the gable on every
roof, and a flat 15% ran short on 14 of the 16. Reused, the hip came within 3
sheets of the gable on every roof. Most of the spread is the top course: a
slope length just over a multiple of 4 ft still takes a row of sheets at the
ridge, which no percentage of area can see. The free roof calculator orders the
first hip layout; the paid edition, Residential Takeoff, orders the second.
No valleys, dormers or damaged sheets; the table is on
`ventures/wall-framing-takeoff/roof-sheathing-waste-factor.html`, pinned to the
benchmark by a test.

## Price the order with your yard's price list, not by the foot (2026-11-28)

Choosing which board lengths to buy is the part of a framing order that
software does better than a person: each plate run and header has to come out
of some mix of 8 to 16 ft boards, and the cheapest mix depends on what each
length costs. With no prices the takeoff minimises the length bought. Yards do
not always charge the same per foot for every length: precut studs are often
priced on their own, and long boards can cost more a foot. When they do, the
cheapest order by length is not the cheapest by money.

The residential takeoff now reads the yard's price list as a CSV, the
description and price columns most quote exports have (`2x4-8' SPF #2, 4.12`,
`2X6X16, 13.90`, prices each, per lineal foot or per thousand board feet). It
reprices the lumber list, so the order is chosen on those prices; fills the
budget's prices for sheets and roofing that the list names by use; and lists
every row it did not read and why, rather than guessing what a "7/16 OSB 4x8"
with no use given is for.

We measured the difference on the invented example house and one generated
plan (`pricelist-bench.mjs`): the same board lengths, ordered once by length
and priced afterwards, once on the prices. The price lists are invented shapes,
not any yard's prices:

| Price list (invented) | Example house | Generated plan |
|---|---|---|
| Same price per foot for every length | 0.0% | -0.1% |
| Precut studs 15% cheaper per foot | 1.3% | 1.3% |
| Long boards dearer (+2% a foot per foot over 8 ft) | 1.8% | 2.7% |
| Both | 3.9% | 5.3% |

On a flat per-foot list there is nothing to win (the -0.1% is the optimiser's
own gap). Where the yard's per-foot price varies by length, a few percent of
the lumber bill comes back by ordering differently, more boards, less money. A
real yard's list will have its own shape; run it through and the order shows
the cost.

## Shingles: squares x 3 bundles plus 10% or 15%, against a count (2026-11-28)

The same 16 roofs, shingled: every field shingle laid course by course
(`shingle-bench.mjs`; a laminated 39-3/8 x 13-1/4 in shingle at a 5-5/8 in
exposure, 22 to a bundle, joints on a 6-1/2 in stair-step), counted two ways:
every course end cut from a new shingle, or offcuts of 6 in or more kept for
later ends.

| Roof | Ends from new shingles | Offcuts reused |
|---|---|---|
| Gable | 5.4 to 11.4% (8.0% on average) | 0.7 to 3.7% (1.7%) |
| Hip | 12.0 to 21.4% (16.5%) | 2.3 to 5.3% (3.6%) |

The usual order, squares x 3 bundles plus 10% on a gable, was never short. The
15% for a hip ran short on 5 of the 16 hips, by 1 or 2 bundles, all on the two
smaller houses, when no hip offcut is reused; with them reused it bought 3 to
13 bundles too many. Reusing offcuts saved 2 to 4 bundles on a gable and 5 to 9
on a hip, more than the roof shape itself (0 to 2 bundles between a hip and a
gable with offcuts reused). Invented houses, one shingle size, no valleys,
starter strip or cap: the table is on the
[shingle bundles page](https://marisstella.app/wall-framing-takeoff/how-many-bundles-of-shingles.html).
