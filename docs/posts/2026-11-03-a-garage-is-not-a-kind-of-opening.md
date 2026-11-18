---
title: "A 500-inch door and a \"garage\" opening: two plans a framing takeoff should refuse"
seo_title: "Wall framing takeoff input checks: door height and opening kind"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, validation]
description: "Probing hostile wall plans by hand found two that a framing takeoff accepted and answered with confident nonsense. Both are now refused with a reason."
---

A takeoff that says "ok" is a promise. We keep breaking that promise on purpose, by hand, to find where it is false.

Today's two finds in `wall-framing-takeoff`:

- An opening with `kind: "garage"` was accepted and framed as a door. Only `window` and `door` exist; a garage door is a door with a wide opening. It is now refused with that hint.
- A door 500 in tall under an 82.5 in header gave `ok: true`. The rough opening would end 417 in below the floor. Doors taller than their header height are now refused, naming the overshoot.

The second check also caught one of our own tests: a door 84 in tall under an 82.5 in header, 1.5 in through the floor. A test input slip, now fixed.

Everything here uses invented plans; no real builder's drawings were checked. Code and tests are MIT licensed in `ventures/wall-framing-takeoff/`.
