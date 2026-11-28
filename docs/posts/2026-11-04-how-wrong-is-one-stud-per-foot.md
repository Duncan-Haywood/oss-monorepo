---
title: "How wrong is one stud per foot, and how much waste to add? Measured on three houses"
seo_title: "Framing lumber waste factor and the stud-per-foot rule, measured"
date: 2026-11-04
updated: 2026-11-28
description: "A counted framing order against the one-stud-per-foot rule, the cutting waste in a framing order, and hip vs. gable roof sheathing waste, measured."
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
