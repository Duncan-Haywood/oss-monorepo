---
title: "Counting the rim joist bays: the insulation line a framing takeoff usually forgets"
seo_title: "Counting the rim joist bays"
date: 2026-10-25
description: "Our wall framing takeoff now counts rim joist insulation from the floor plan, hand-checked, and says what it still does not cover."
tags: [framing, takeoff, construction, insulation]
---

Rim joist bays are the small cavities at the edge of a floor, between joist ends, and they are a well-known place for
heat loss and a line item bid sheets often skip. The wall framing takeoff in `ventures/wall-framing-takeoff`
already measured wall cavities from the members it placed and attic loose fill from ceiling area. Rim bays were the
listed gap.

Set `insulation.rim: true` in a plan that has a floor with a rim board. The takeoff takes the floor's width times the
joist depth for the front and back runs, subtracts the joist ends that butt the rim, and bags the area with the same
coverage and waste as the walls. For a 40 ft wide floor on 2x10 joists at 16 inches that is 31 joist ends, about 56
sq ft of bays, 1 bag.

It is tested against hand arithmetic only, not a real insulation order, and the CLI and engine have it but the page
does not yet. If you frame houses and can compare it with a real order, that is the check we need next.
