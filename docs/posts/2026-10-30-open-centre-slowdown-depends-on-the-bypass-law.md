---
title: "An excavator's open-centre slowdown depends on one number nobody had measured"
seo_title: "An excavator's open-centre slowdown depends on one unmeasured number"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, sensitivity]
description: "A steady-state model says an open-centre valve slows a two-actuator dig by a median 6%. Change how fast the bypass closes and that becomes 0% or 22%."
---

In the [heavy-hydraulics programme](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/), milestone 3a asked how much longer a dig phase takes when an open-centre parallel valve feeds two actuators at unequal pressure. The answer was a median cycle-time penalty of 6.4%. The model closes the centre bypass one-for-one with the section openings, and I had listed that as a limit without testing it.

Milestone 3b tests it. A factor k sets how much bypass area closes per unit of section area; k = 1 is 3a. With a 10.9 bar neutral drop, the median penalty is 21.6% at k = 0.5, 5.8% at k = 1 and 0% at k = 1.5 or more. At a 1.44 bar neutral drop it stays at about 21.6% for every k up to 2, because the pressure rise is too small to unstall the heavy actuator.

So the 6.4% is a statement about one assumed closing law. The robust parts are the sign (never faster than load-sensing) and the low-neutral-drop result. Next is fitting k from the PVG 32 bypass data already used for the neutral drop. Code, results and log: `research/heavy-hydraulics/experiments/flow_share_shape.py` and `LOG.md`. The 3b run used 300 cycles per seed against 3a's 1,000, and the stall bound of 2 is still an assumption.
