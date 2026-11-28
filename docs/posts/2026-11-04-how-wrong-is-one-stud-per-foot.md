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
