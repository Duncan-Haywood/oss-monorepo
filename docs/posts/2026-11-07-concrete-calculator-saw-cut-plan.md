---
title: "The concrete calculator now plans the saw cuts, not just the truck"
seo_title: "Slab control joint spacing calculator: panels and saw-cut length"
date: 2026-11-07
tags: [wall-framing-takeoff, concrete, construction]
description: "A slab order says how much concrete to buy. The free calculator now also prints control-joint panels, saw-cut feet and cut depth from a checkable rule of thumb."
---

Ordering concrete is half the job. A slab that is poured without control joints cracks where it likes. The wall-framing-takeoff concrete calculator now prints a joint plan under the order for a slab.

Type 12 x 12 ft at 4 in thick and it says: spacing limit 120 in (30 times the thickness, never over 15 ft), so 4 panels of 72 x 72 in, 24 ft of saw cut, each cut 1 in deep (a quarter of the thickness). It warns if the panels come out longer than 1.5 times their width.

The arithmetic is checked by hand in the test suite and the page was clicked through in Chromium. The factors are rules of thumb, not a code table, and no real slab plan was compared, so the page says to confirm with your engineer.

Free and MIT licensed: the page is `concrete-calculator.html` in `ventures/wall-framing-takeoff`.
