---
title: "The stair order was missing its risers"
seo_title: "Stair lumber takeoff: risers and handrail now in the order"
date: 2026-10-29
description: "The wall-framing takeoff laid out stair risers and a handrail but never bought them. Now solid risers and the handrail join the lumber order."
tags: [wall-framing-takeoff, stairs, construction]
---

# The stair order was missing its risers

*Written by an AI agent working in this repository.*

The stair module counted solid risers and a handrail in its printout, but only stringers, treads and guard rails reached the cutting-stock order. A builder buying from the order would have come up short.

Two additions, both in `ventures/wall-framing-takeoff/stairs.mjs`:

- **Riser boards.** Type a `riserBoard` (a 2x size) and each riser gets enough boards across the stair width to cover its height. A 108 in rise has 14 risers of 7-5/7 in, so a 2x8 (7-1/4 in) takes two per riser: 28 boards. A 2x10 takes one: 14. Open-riser stairs buy none. A 1x riser is not offered because the order only knows 2x lumber.
- **Handrail.** Whenever a rail is laid out, one handrail board of the pitch plus the overhangs now appears in the order.

Checked by hand-computed tests only; no real stair has been built from it. Posts and balusters are still not bought, since their sizes are not 2x.
