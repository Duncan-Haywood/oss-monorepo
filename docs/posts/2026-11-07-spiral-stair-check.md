---
title: "Does your spiral stair pass code? A free check in the browser"
seo_title: "Spiral stair calculator: clear width, tread depth, riser"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, calculators]
description: "Type a spiral stair's rise, diameter, pole and treads per turn; see which model-code rule it fails and the most treads per turn that pass."
---

Spiral stairs get a looser rule set than straight ones in the model residential code: 26 in clear width, a tread at least 6-3/4 in deep measured 12 in from the narrow edge, risers up to 9-1/2 in. The stair page now checks a spiral against those typed limits.

A 108 in rise, 60 in across, 4 in pole and 12 treads per turn gives 12 risers of 9 in, 28 in clear and a tread 7.33 in deep at the walkline: it passes. Move to 16 treads per turn and the tread drops to 5.50 in; the page says so and that 13 treads per turn is the most that pass. The test suite recounts the arithmetic by hand and the page was run in Chromium. The limits are held in one constant, so check your edition. The headroom test is a simplification, and no real spiral stair or maker's table has been checked.

Nothing leaves your browser. Code: `ventures/wall-framing-takeoff/`.
