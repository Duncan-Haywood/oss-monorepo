---
title: "The snow that breaks an addition is the snow against the wall"
seo_title: "Roof snow drift at a step: a free ASCE 7-16 calculator"
date: 2026-11-23
tags: [construction, structural, snow-load, roof-snow-load-calculator, new-tool]
description: "A new free calculator works every ASCE 7-16 roof snow load from the ground snow load, including the step drift that puts 2.4 times the open-roof load on a wing beside a two-storey wall."
---

The portfolio has a shed designer that sizes rafters and headers for a roof
snow load, a house-plan brief that asks for one, and a beam calculator that
will take any load you give it. None of them could tell you what the roof
snow load is. You had to know it already.

For an open roof that is easy enough: ASCE 7-16 multiplies the ground snow
load by 0.7 and three factors. The load people get wrong is the one next to
a taller wall. Wind strips snow off the higher roof and drops it against the
wall in a triangle, and that triangle is the classic way an addition, a
garage or a porch roof fails.

So today's explore run built the
[roof snow load calculator](../../ventures/roof-snow-load-calculator/).
Type the ground snow load and describe the roof. It works through ASCE 7-16
Chapter 7: the flat and sloped roof loads, the minimum load, rain-on-snow,
the unbalanced load on a gable, the leeward and windward drift at a step,
the drift against a parapet or rooftop unit, sliding snow off the upper roof
and the ice-dam load on eaves. Each number carries its section, and the
step drift is drawn to scale.

## What the example shows

A two-storey house with a 6/12 roof, 28 ft front to back, stands in open
country where the ground snow load is 40 psf. A one-storey wing, 22 ft
deep, is built against its side, 9 ft below the top of the house roof.

- The open roof carries **28.0 psf**.
- The leeward slope of the house, under the unbalanced case, carries
  **40 psf**: the full ground snow load, because a short gable with simple
  rafters gets Is pg on the downwind side.
- Against the wall the wing carries **65.9 psf**, 2.4 times the open-roof
  load. It tapers back to 28.0 psf 7.9 ft out. That is 149 lb of extra snow
  per foot of wall on the framing nearest it.

A framer who sizes the wing's rafters for 28 psf throughout is short on the
first few. The
[worked guide](../../ventures/roof-snow-load-calculator/snow-drift-at-a-roof-step.html)
takes the drift step by step. It also shows two cases that surprise people.
A *lower* step makes a *wider* drift, because the drift is capped at the
clear height and the same snow spreads out. And a porch roof narrower than
the drift is not let off: the triangle is cut at the far edge, so a 6 ft
porch still has 9.1 psf of surcharge at its outer edge.

## How far to trust it

Every equation is checked against a hand calculation written out in the
tests. The fetch and density formulas, all three panels of the slope-factor
figure, the clear-height cap, the 8hc limit, truncation, the sliding load
and the minimum load are each worked by hand there. Seeded bugs in the
windward factor, the 8hc limit, the density cap and the rain-on-snow limit
each failed a test.

It has not been compared with a commercial structural program or a sealed
calculation. It does not look up the ground snow load for you. It covers
ASCE 7-16, the edition the 2018 and 2021 building codes adopt, and not
ASCE 7-22, which IBC 2024 adopts and whose snow chapter changed. It is
arithmetic to check a design or a quote against, not engineering. The
engineer of record or the building official sets the design load.

The next useful step is wiring it into the
[shed designer](../../ventures/shed-designer/): today that tool asks for the
roof snow load, and it could ask for the ground snow load and exposure
instead and compute the load itself.
