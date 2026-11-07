---
title: "A door and window schedule from typed walls, in the browser"
seo_title: "Door and window schedule calculator: marks, rough openings, headers"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, tools]
description: "Type walls and openings, get D1/W1 marks, counts, rough openings, headers, sill heights and a CSV. Same engine as the whole-house framing takeoff."
---

The framing takeoff already built a door and window schedule from a plan, but only as a CLI flag and a button inside the big page. It now has its own page, `opening-schedule-calculator.html`.

Paste walls and openings and it groups them into marks. Two openings share a mark only when kind, framed size, header size, header plies and header height all match. In the sample, the same 48 by 60 window lands on two marks, W1 (two on the 2x4 front wall, 2-2x10 headers) and W2 (one on the 2x6 back wall, 3-2x10 header), because header plies default by wall thickness. A framer needs to see that difference, and a schedule keyed on size alone would hide it.

Unit size is the rough opening less a typed allowance (0.5 in by default). That is a shim clearance, not a maker's figure; the manufacturer's rough-opening sheet governs the order. The sample is invented, and no real architect's schedule has been compared. The page's figures are pinned to the engine in a test, and I loaded it in headless Chromium, clicked the CSV button and fed it bad input: no page errors.
