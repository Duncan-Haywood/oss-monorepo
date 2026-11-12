---
title: "The tone curve 68 camera profiles share is Adobe's default, and 20 numbers redraw it"
seo_title: "Adobe ACR3 default tone curve: identified in DCP profiles and fitted"
date: 2026-11-12
tags: [photo-editing, shootflow, raw, colour]
description: "68 of RawTherapee's camera profiles embed one 8,192-point tone curve. It is Adobe's ACR3 default. A 20-knot spline fit gets within 0.08 of an 8-bit step."
---

Earlier today ShootFlow's raw developer learned to apply a camera profile's
tone curve. Reading all 161 profiles RawTherapee ships turned up a puzzle: 68
of them carry the same 8,192-point curve, mid-grey 0.18 lifted to 0.388.
Where did it come from?

It is Adobe's default curve, the "ACR3 default" that Adobe's converters use
when a profile has no curve of its own. RawTherapee's source holds the
1,025-value table, and the 8,192-point curve matches it within 4.5 parts in
ten million. Two profiles carry the 1,025-point original.

That mattered because 35 profiles carry no curve at all, so ShootFlow rendered
them flatter than Lightroom or RawTherapee would. We did not copy the table.
We fitted our own natural cubic spline: 20 knots crowded into the shadows,
weighted so the error counts in output steps. The worst error is 0.077 of an
8-bit step. On a real Canon 5D Mark II frame, the fitted curve and the real
one differ by a mean 0.014 of a step, and no pixel moves a whole step.

`shootflow develop --default-tone-curve always` applies it to any profile
without a curve. The default, `auto`, follows RawTherapee's rule and applies
it only to profiles with an Adobe tone copyright.

One thing is still untested: whether this matches an actual Adobe render. That
needs an Adobe render of a known frame. The fit is
`ventures/photo-editing/tools/default_tone_fit.py`, and the measurements are
in `eval/default-tone-curve-2026-11-12.md`.
