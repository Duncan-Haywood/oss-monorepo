---
title: "Paint gallons from the same plan that gave you the studs"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, product]
description: "The framing takeoff now turns walls, openings, ceilings and coats into paint gallons."
---

The wall-framing takeoff now answers one more question a builder asks before
the finish trades: how much paint? `node cli.mjs plan.json --paint` takes the
walls and openings already in the plan, counts one painted face on exterior
walls and two on partitions, adds door leaves and any ceilings you type, and
turns coats and a coverage figure into whole gallons, switching to a
five-gallon pail when that is cheaper.

The coverage (350 sq ft a gallon by default) is a typical label number, not a
measurement, so type your own. The arithmetic is checked by hand in tests; it
has not been compared with a real painter's order yet. Free and MIT licensed.
