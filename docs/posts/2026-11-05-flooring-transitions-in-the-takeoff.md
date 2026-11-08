---
title: "Doorway transitions now count in the flooring takeoff"
seo_title: "Flooring transition strips: how many bars to order per doorway"
date: 2026-11-05
tags: [wall-framing-takeoff, flooring, construction]
description: "The flooring takeoff counts doorway transition strips as whole bars and puts them in the budget."
---

Where plank meets tile or carpet, a transition strip covers the gap. Our flooring takeoff counted boxes, tiles, grout, carpet and tack strip but left these out, so a budget was a few bars short.

Each room can now carry a `doorways` count, and a `transition` block types the door width (default 36 in) and bar length (default 72 in). A 72 in bar gives two 36 in pieces, so five doorways need three bars, not 2.5. A 48 in door gets one piece per bar. The bars show in the budget as "Transition bars" under the price key `transitionBar`.

Honest limits: the defaults are typed figures, the tests are hand sums, and no real flooring order has been checked. Count each doorway once. Stair nosing is still not counted. The code is MIT licensed in `ventures/wall-framing-takeoff`.
