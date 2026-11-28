---
title: "How wrong is one stud per foot, and how much waste to add? Measured on three houses"
seo_title: "Framing lumber waste factor and the stud-per-foot rule, measured"
date: 2026-11-04
updated: 2026-11-28
description: "A counted framing order against the one-stud-per-foot rule, and how much of the order is cutting waste: 0.2 to 0.4% with a cut plan, 19 to 30% without one."
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
