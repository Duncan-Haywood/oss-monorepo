---
title: "Drywall ceilings now follow the roof's own ceiling joists"
date: 2026-10-26
description: "The wall framing takeoff reads ceiling joist positions from its roof layout, so drywall end joints land on the joists the plan actually has."
tags: [wall-framing-takeoff, construction, drywall]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) could snap ceiling drywall joints to joists, but only on a joist spacing the user typed in a second time. If the roof was framed at 24 in and the drywall said 16 in, the answer quietly disagreed with the plan.

New plan key `drywall.ceilingJoistsFromRoof: true` reads the joist centres the roof layout placed (gable or hip) and cuts each course back to the last joist it reaches. A ceiling that covers only part of the building takes `joistOrigin`, the inches from the roof's first wall. Setting both this and `ceilingJoistSpacing` is refused, and so is using it without a roof that lists a ceiling joist size.

Checked by a hand-count test (240 in ceiling, 24 in joists from the roof, no joint off a joist) and one CLI run on the sample house. Not checked against a real ceiling hang. Estimates only, not engineering or building-code advice.
