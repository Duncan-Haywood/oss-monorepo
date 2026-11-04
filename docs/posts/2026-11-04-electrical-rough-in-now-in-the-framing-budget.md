---
title: "Electrical rough-in counts now flow into the framing budget"
seo_title: "House framing takeoff budget with receptacle, switch and cable counts"
date: 2026-11-04
tags: [construction, takeoff, budget, open-source]
description: "The wall-framing takeoff's budget now prices receptacles, switches, device boxes and cable rolls from the same plan, and lists any it cannot price."
---

The wall-framing takeoff gained an electrical rough-in count earlier today
(receptacle boxes by the NEC 210.52(A) wall-space rule, a switch box per door,
a cable estimate). Those counts sat outside the budget. With `--budget` they now
appear in an "Electrical" section: receptacles, switches, device boxes and
cable rolls, each priced from the plan's electrical settings or overridden by
budget price keys (`receptacle`, `electricalSwitch`, `electricalBox`,
`cableRoll`).

As everywhere in the tool, a quantity with no typed price is listed as
unpriced, never guessed, and no prices are shipped. The counts are a
walk-through starting point, not a code review: kitchens, baths, garages and
the panel are not counted. Tested on hand-checked invented plans only; no real
electrician's count yet.
