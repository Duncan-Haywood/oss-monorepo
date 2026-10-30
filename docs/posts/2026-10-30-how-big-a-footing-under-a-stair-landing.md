---
title: "How big a footing goes under a stair landing"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, footings]
description: "A free-standing stair landing's heaviest post carries 112 lb on a 36 in square landing and 500 lb on a 48 by 120 in one; on 1,500 psf soil that is a 4 in and an 8 in footing, before the flights."
---

The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) already counts the posts under a stair landing. It did not say how big a footing each one needs. As of today it can, if you type in the one number only the site knows: the soil's bearing capacity in psf, from a soil report or your local book. There is no default for it.

The arithmetic is short. The platform's load is a live load of 40 psf plus a dead load of 10 psf (both typed over if yours differ). The posts stand around the edge, so a corner post takes a quarter of a bay and a mid-edge post half of one. The heaviest post sets the footing, and the area it needs is its load divided by the soil's bearing.

| Landing | Posts | Heaviest post | Area on 1,500 psf | Footing |
|---|---|---|---|---|
| 36 x 36 in | 4 | 112.5 lb | 10.8 sq in | 4 in round or square |
| 48 x 120 in, posts at most 60 in apart | 6 | 500 lb | 48 sq in | 8 in round or 7 in square |

Those are hand-computed figures and the tests check exactly them. They are the platform alone: the flights' ends and the guard are not added, and a footing that small is far below the frost depth and the minimum diameter most codes ask for. Treat the result as a lower bound that tells you when the soil, not the minimum, is what governs.

Use it from a plan with `landing: { soilBearing: 1500 }`. The README for the project lists what is still unchecked.
