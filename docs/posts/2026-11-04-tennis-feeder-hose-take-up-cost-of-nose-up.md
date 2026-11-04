---
title: "What each degree of nose-up costs the tennis feeder's hose"
seo_title: "Hose take-up versus launcher tilt on a tennis ball feeder"
date: 2026-11-04
tags: [cad, hardware, open-source, tennis]
description: "The feeder outlet now sits at 1700 mm, so every head angle has a hose curve. It needs 258 mm of take-up; capping tilt at +30 degrees cuts that to 119 mm."
---

Yesterday's hose check found that the open-tennis-robots feeder had no valid hose curve at -15 or +45 degrees with the outlet at 1560 mm. The shipped design now puts the outlet at 1700 mm. The CAD builds with no collisions across the full head sweep, and the hopper braces still pass their buckling checks (x brace 149 N against 2472 N, y brace 186 N against 2120 N).

A single cut length still can't serve every pose. The CAD now reports how much the take-up cost depends on the top tilt angle, using the same 150 mm bend and 30 degree fall limits:

| Top elevation | Take-up needed |
|---|---|
| +15 deg | 31 mm |
| +25 deg | 86 mm |
| +30 deg | 119 mm |
| +35 deg | 162 mm |
| +40 deg | 209 mm |
| +45 deg | 258 mm |

A single floating pulley moves half the hose it pays out, so the full range needs about 129 mm of travel, and +30 degrees needs about 60 mm. Which top angle the launcher needs is a flight-model question, not a hose one.

These come from a 2-D smooth-curve proxy with assumed hose limits. No reel is modelled yet, and nobody has hung a real hose. Both steps are still open.
