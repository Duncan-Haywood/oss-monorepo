---
title: "An infinite wall volume read as a unit slip: red team on an IFC quantity takeoff"
seo_title: "IFC quantity takeoff tests: an overflowing volume, earClip, half space"
date: 2026-11-24
tags: [redteam, testing, mutation-testing, ifc-quantity-takeoff, ifc, bim, javascript, ventures]
description: "Red team on an IFC quantity takeoff: 11 of 20 seeded bugs caught, 9 gaps closed, and a stored 1.E400 volume no longer reads as a unit slip."
---

Today's red-team run went at the
[IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/), which
reads a BIM model in the browser and turns it into a bill of quantities. It
checks every quantity the model stores against the geometry and names the
reason when the two disagree. Two files were the targets: `qto.mjs` (the
takeoff and its explanations) and `geom.mjs` (profiles, curves, booleans and
the triangulator). Their 270 tests run in about three seconds.

We tried the playoff-race solver in the league schedule generator first. Its
whole suite takes minutes, which is too long to run once per mutant, so that
campaign was stopped. A differential fuzz did run against it: 3,000 random
small leagues, with six point systems, compared against full enumeration and
then rerun at budgets from 1 to 30 nodes. Clinch, elimination and magic
numbers matched every time, and with the budget cut short they always stayed
on the safe side.

## Seeded bugs

| File | Seeded | Caught | Gaps closed |
|---|---|---|---|
| `ifc-quantity-takeoff/qto.mjs` | 10 | 6 | 4 |
| `ifc-quantity-takeoff/geom.mjs` | 10 | 5 | 5 |

Catch rate went from 11 of 20 to 20 of 20 after the new tests. These got
through:

- **The glass test's `transparency < 1` changed to `< 2`.** A surface style
  drawn fully transparent is air or a void, not a pane, but no test had a
  style at exactly 1. One does now, plus one at 0.99 that still counts.
- **A room's placement made enumerable.** That would have leaked the room's
  world matrix into the JSON and CSV output. A test now checks that the
  solid, placement and unit stay hidden.
- **A footprint room's box corner read from the wrong argument.** Rooms built
  from a FootPrint curve and a bounding box would all start at z = 0. The new
  test raises the box corner by 300 mm and checks that the room moves up with it.
- **`computed > 0` changed to `computed > 1` in the compound unit-slip check.**
  Every fixture had a volume over 1 m³, so a 0.4 m³ slab never came up.
- **Five geometry faults:** a parameter-trimmed line divided by its parameter
  instead of multiplied, the three-point arc's determinant, a T profile's
  flange corner, the bounded half space's axis taken from the translation
  column, and the ear clipper's point-in-triangle test turned into an
  `or`. The ear clipper passed the old L-shaped test and failed only on a
  comb with three teeth. Each fault now has a test written for it.

## The real defect

`unitSlip` checks whether a stored figure is the computed one times 10ⁿ or
times 10.7639 (square feet). Its comparison is
`|a − b| <= tol × |b|`. When the stored value is `Infinity`, both sides are
`Infinity`, so the check passed for any factor. A STEP file that stores
`GrossVolume 1.E400` parses to `Infinity`, and the 3 m³ wall in our sample
model came back as "unit slip, factor 10.7639". Both slip checks now take
finite numbers only. The same wall now gets the explanation that holds: the
stored volume disagrees with the wall's own stored dimensions, and the
geometry agrees with them.

It is a small bug. But the product's selling point is that each explanation
it gives can be trusted, so a made-up explanation is worse than "unexplained".
