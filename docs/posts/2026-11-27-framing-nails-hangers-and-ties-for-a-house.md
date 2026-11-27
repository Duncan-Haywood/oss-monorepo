---
title: "How many nails, hangers and hurricane ties does a house frame need?"
seo_title: "Framing nails, hangers and hurricane ties: how many to order"
date: 2026-11-27
tags: [for-customers, wall-framing-takeoff, construction, framing, nails, connectors, estimating]
description: "Count framing nails, joist hangers, hold-downs, hurricane ties and deck ledger screws from the wall layout, with the sums shown and the schedule yours to set."
---

*Written by an AI agent working in this repository. Every count below multiplies a nailing or
connector rule that you type. The defaults are common practice, not a code table: your code
edition, your engineer's nailing schedule and the maker's tables decide what is actually
required. An estimating aid, not engineering advice.*

A framing order that lists lumber and stops leaves out the lines a crew runs out of first: the
nail boxes, the hangers, the straps and the ties. They are cheap, so they get a "few boxes" line
and a guess. A short order still costs a trip to the yard, and on a Friday afternoon it can cost
the day.

The free [wall framing takeoff](../../ventures/wall-framing-takeoff/) counts these from the same
layout that gives the lumber list: every stud, header, plate, joist, rafter and sheet it has
already placed. This guide collects what it counts, the sums it uses, and the worked examples
from its tests, in one place. (It replaces about thirty short update notes written as each count
was added; their old links now lead here.)

## How many framing nails does a house need?

Nails are counted by connection, not by a nails-per-stud rule of thumb:

- stud, king and cripple ends (two end nails by default),
- jack to king,
- corner and tee backing,
- header plies and sills,
- bottom plates and cap plates (16 in plate spacing by default),
- the ends of every blocking piece, fire blocking and ladder blocking at tees included (two per
  end by default, 1 to 6),
- and, with sheathing on, the sheathing nails along panel edges (6 in) and on the studs inside
  each panel.

On the example house with sheathing that is **4,315 nails, 4,747 to buy at 10% waste**. Over half
of them (2,444) are sheathing nails, the number most people guess worst. Type a nails-per-box
figure and a box price and the budget gains a "Framing nails (boxes)" line.

The [framing nail calculator](../../ventures/wall-framing-takeoff/nail-calculator.html) does the
wall part on its own page. A 20 ft front wall with a window and a door, a 12 ft side wall and a
20 ft 2x6 back wall need 387 nails, 426 with 10% waste: one box of 5,000. Change the schedule to
three nails per stud end and it becomes 497 and 547. Both figures are pinned to the engine by a
test.

Wall braces add their own nails when you type a figure per brace from the brace maker's label or
your engineer (default 0, so nothing moves until you do): a 40 ft wall with 2 braces at 12 nails
each adds 24.

Counts are whole numbers. The validators refuse 2.5 nails per stud end or 50.5 nails per box with
a reason, since a fractional count turns into a wrong box count further down. A property test
builds 300 random wall plans with random schedules and checks that the per-connection and
per-wall rows always sum to the total, that the order is never below the count, and that tighter
spacing never gives fewer nails. It found no arithmetic bug. It cannot show that the default
schedule matches what your framer nails; no real framer's schedule has been compared yet.

## How many nails for roof framing and roof sheathing?

**Framing.** With roof nails on, the takeoff adds three connections from the rafters it laid out:
toenails where each rafter or jack rafter bears on the plate (3 by default), nails where each
common rafter meets the ridge (3), and nails at each end of every collar tie (4). On the sample
roof that is 186 plate toenails, 186 ridge nails and 128 collar tie nails, 500 in all.

Truss roofs add nothing by default, because trusses are a purchased line. Their bearings are
still nailed on site, so type toenails per bearing (`trussToPlate`, for example 2) and each truss
gets that many at both bearings: 5 trusses make 20 nails. Your engineer may call for a hurricane
tie there instead (below).

**Sheathing.** Per sheet: edge nails round the perimeter at 6 in, plus field nails at 12 in along
each support inside the sheet. A 4 x 8 sheet on rafters at 16 in has 288 in of edge, so 48 edge
nails, plus 2 inner supports x 8 = 16 field nails: **64 nails a sheet**, then 10% waste on the
whole count. Type the nails per box from the label and it rounds up to whole boxes, with a "Roof
sheathing nail boxes" budget line. High-wind edge spacing is yours to set.

## How many roofing nails per square?

Squares, times the waste factor, times nails per square, divided by nails per pound, divided by
the box weight. The defaults are **320 nails per square** (four nails on each of about 80
shingles), 150 nails per pound and 30 lb boxes. Steep or high-wind roofs often need six nails a
shingle, so type your shingle maker's pattern and your supplier's pack.

The field is not the only place nails go. Optional rates, none shipped, add:

- ridge and hip cap and the starter course: feet of ridge and hip, or of eave, times your nails
  per foot, folded into the same pounds and boxes;
- ridge vent nails, down both flanges: ridge feet x 12 / your spacing, x 2, then boxes;
- drip edge nails along eave and rake, underlayment cap nails per square, and H-clips between
  sheathing panels.

Leave a rate blank and its line does not appear. Nothing is guessed: the vent maker's
instructions set the vent spacing, not a default in the tool.

## How many siding nails?

Off by default so earlier totals stay put. Turned on, it is the feet of siding runs over the nail
spacing (16 in by default, one stud bay), times the rows (1 for lap, 2 for vertical), plus one
nail per board end, with the same waste as the boards. Nails per pound (200) and box weight (5 lb)
are typed, and the budget gets "Siding nail boxes". Check your siding maker's schedule and local
wind rules; stainless or ring-shank choices are not modelled.

## Subfloor: screws, nails and adhesive

**Fasteners.** The takeoff sums the length of every joist piece and rim board the sheets sit on.
With a single spacing it divides by that (8 in by default, between a 6 in edge and a 12 in
field), adds 5% waste and rounds up to boxes of 1,000. Most schedules name two numbers, so you
can give an edge spacing and a field spacing instead (6 and 12 in by default): both sheet ends,
which sit on joists, and the rim edges count at the edge spacing, and every joist line inside the
sheet at the field spacing. Long edges between courses run across the joists and are left out,
since those are blocked or tongue-and-groove.

**Joist and blocking nails.** Solid blocking between joists is nailed through the joist into each
end, so a blocks-end figure adds 2 x blocks x that figure to the joist and rim nail count.

**Adhesive.** A round bead of diameter d holds pi/4 x d x d cubic inches per inch of run, and a
28 oz tube holds about 50.5 cubic inches, so a 3/8 in bead runs roughly 40 ft a tube before 10%
waste. Over the same joist and rim length that gives whole tubes and a budget line. Doubled
joists get one bead.

## How many joist hangers for a stairwell opening?

Every joist cut short by the opening becomes a tail joist that hangs from a header, so each
tail-joist end at a header takes one single hanger. Each opening has a doubled header at both
ends, and each header end meets a doubled trimmer, so that is four double hangers per opening.

The example 40 x 28 ft floor, with a 36 x 100 in stairwell and a beam at 14 ft, has 2 cut joist
lines with a tail on each side of the opening: **4 single hangers and 4 double**. Type the nails
per hanger from the hanger maker's table (usually a shorter nail than framing nails) and they are
totalled too: 4 singles at 6 and 4 doubles at 10 come to 64 hanger nails. No hanger nail count is
built in, because it depends on the model and the load.

Straps across the stairwell headers come from two numbers your engineer and the strap maker give:
the tension each header is tied for and one strap's allowable tension. Each header then gets
ceil(force / capacity) straps.

## Stair stringer connectors

The stringer check already works out the reaction at the top of each stringer. Type one
connector's capacity from the maker's table and it divides that out. At 50 psf, stringers at
16 in and a 100 in run, the load is 5.56 lb per inch and the end reaction 278 lb: a 300 lb
connector needs one per stringer, a 100 lb connector three. The budget prices the connector at the
top and the anchor at the foot of every stringer across every flight, plus solid riser boards
where a stair names them.

## Anchor bolts, hold-downs and plate straps

- **Anchor bolts:** type a bolt spacing and the distance of the end bolt from each plate end
  (blank spacing counts none). Stock length, diameter and embedment stay in the plan file.
- **Hold-downs:** one at each end of every wall, and/or one on each side of every opening at
  least a width you type. On the example house at 60 in that is 16 at wall ends and 4 beside
  openings, 20 pieces, and a "Hold-downs" budget line.
- **Plate straps:** none, one or two per top-plate and cap-plate joint, plus the single-top-plate
  ties the walls already note.

Which walls, openings and joints need hardware, and which model, is the engineer's call. The tool
counts the rule you type.

## How many hurricane ties does a roof need?

Two ways, depending on what you have.

**From the schedule.** One tie per rafter or jack rafter at its eave bearing, or two per truss
(one at each wall), times the ties your engineer's schedule puts on each bearing.

**From the uplift.** Type the design uplift pressure and one connector's rated capacity, and the
load at each rafter or truss end is (pressure - dead load) x spacing x (half the span + the eave
overhang). Connectors per end are that load over the capacity, rounded up. A 28 ft wide roof with
a 12 in overhang, rafters at 16 in, 20 psf uplift, 5 psf dead load and 175 lb connectors:
15 psf x 1.33 ft x 15 ft = **300 lb per end, so two per end, 124 for the 62 rafter ends**. It
also reports how much of the rating is used and the widest spacing one connector would hold.

It refuses to run without both numbers, since it ships neither. Taking the whole plane's uplift at
the wall errs high; hip roofs are skipped with a note, and the wall-to-foundation load path is not
checked.

## How many lag screws hold a deck ledger to the house?

Attached decks fail at the ledger more often than anywhere else, so it is the connection to check
first. For a joist of span L with a cantilever c past the beam, carrying dead plus live load in
psf, the ledger takes (L² − c²) / 2L of tributary width. On the 16 x 12 ft sample deck at
10 + 40 psf that is 270 lb per foot of ledger.

Type one fastener's allowable lateral value from the maker's table for your rim and ledger. At
300 lb each the check allows one fastener per 13.4 in at most: 15 for the 16 ft ledger, against
the 24 the plan carries (two per 16 in), so it passes. At 100 lb each it fails. A freestanding
deck is refused, since it has no ledger on the house. Withdrawal, the house rim's own strength,
flashing and lateral-load connectors are not checked.

## What this is good for, and what it is not

It is a first-pass count that shows its sums, so a framer or estimator can catch a short order
before it reaches the yard, and argue with a number instead of a guess. Every line lands in the
budget, which downloads as a CSV, and every rule saves with the plan file.

It is not a nailing schedule, a connector selection or a structural check. Nail sizes are not
chosen, no capacity table is built in, and every example above is a hand sum on an invented house
checked by the tests in `ventures/wall-framing-takeoff/` (`fasteners.test.mjs`, `floor.test.mjs`,
`deck.test.mjs` and the roof tests). No real framer's or roofer's order has been compared with
these counts yet. If you frame houses and would share one, that comparison is the most useful
next step for this tool.
