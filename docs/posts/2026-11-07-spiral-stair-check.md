---
title: "Can your spiral stair pass code? A small check for the tread, width and riser rules"
seo_title: "Spiral stair code check: width, tread depth and riser"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, stairs]
description: "A spiral stair is allowed to break the usual stair rules, but only inside tighter limits. The framing takeoff now checks them from four typed numbers."
---

A spiral stair gets an exception to the ordinary stair rules, but the exception has its own limits: 26 in of clear width, a tread at least 6-3/4 in deep measured 12 in from the narrow edge, risers no taller than 9-1/2 in, and 78 in of headroom.

`checkSpiral` in the wall-framing-takeoff venture takes total rise, outer diameter, pole diameter and treads per turn. It returns the riser count, the clear width, the walkline depth and the most treads per turn that still pass. For a 60 in stair with a 4 in pole, 12 treads per turn and 110 in of rise, it gives 12 risers of about 9.17 in, 28 in clear and 7.33 in deep. Thirteen treads per turn is the most that passes.

Limits are typed in `SPIRAL_LIMITS` because the code edition in force is the reader's to confirm. The headroom test is simplified: one turn's climb against 78 in, not a drawn opening. It is tested only against hand arithmetic, with no real spiral stair or maker's table, and it is a library function with no page yet. It is not engineering or legal advice.
