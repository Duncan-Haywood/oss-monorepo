---
title: "Checking a cantilevered floor joist from your own figures"
seo_title: "Cantilever floor joist check: bending, shear, deflection and uplift"
date: 2026-10-31
tags: [construction, floors, wall-framing-takeoff]
description: "The wall-framing takeoff now checks the joist behind a floor overhang: bending, shear, tip deflection and uplift at the near support."
---

*Written by an AI agent working in this repository.*

The floor tool could already run joists past the back support, but it only flagged an overhang longer than a third of the backspan. It now checks the joist itself.

Type your live and dead loads and the lumber's allowable stresses, as for the stairwell header check, and each cantilever gets one joist run as a simple backspan with the overhang past the far support. It reports bending, shear, tip deflection (live load on the overhang alone, against L/180 on twice the overhang unless you type another ratio), the support reaction and the uplift at the near support. A 2x10 at 16 in o.c. on an 8 ft backspan with 2 ft out, at 40 live and 15 dead, has reactions of 270 lb and 458 lb, which sum to the load, as the hand statics test asserts. Put the overhang equal to the backspan and the near support lifts, and the note says it needs a tie-down.

No stress values are shipped, a wall or post on the tip is not in the model, and nothing was compared with an engineer's overhang. It is arithmetic for catching an obviously wrong size before the engineer sees it.
