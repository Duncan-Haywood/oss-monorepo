---
title: "Paint now counts the trim you already ordered"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, product]
description: "Run --paint with --trim and the framing takeoff paints the same baseboard and casing it lists."
---

The paint takeoff added yesterday asked you to type the lineal feet of trim to
paint. That was a number the same tool had already worked out: `--trim` lists
baseboard, door and window casing and shoe moulding board by board. Now
`node cli.mjs plan.json --trim --paint` passes those feet straight to the paint
estimate, at the typed coverage per gallon, and the report says so. Type your
own `trimFeet` in the plan and that wins.

The change is checked by a CLI test (trim feet match, more paint than without
trim, typed value overrides). The 150 ft per gallon trim coverage is still a
default, not a measurement, and nothing here has been compared with a real
painter's order. Free and MIT licensed.
