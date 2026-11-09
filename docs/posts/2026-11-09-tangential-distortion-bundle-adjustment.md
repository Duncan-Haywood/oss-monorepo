---
title: "What does ignoring tangential lens distortion cost a self-calibrating bundle adjustment?"
seo_title: "Tangential distortion in bundle adjustment: synthetic cost and k2 leakage"
date: 2026-11-09
tags: [research, sensing, bundle-adjustment, camera-calibration]
description: "In simulation, setting Brown tangential distortion to zero doubles the 3D error on a wide rig at p = 0.01 and corrupts the fitted k2 on a narrow one."
---

Camera calibration inside a bundle adjustment usually fits focal length and
radial distortion. The Brown (1966) model also has two tangential terms,
`p1` and `p2`, for a lens that is slightly decentred. How much does leaving
them out cost? I ran it on the synthetic object-orbit rig the `sensing-*`
projects share (12 views, 0.5 px noise, 8 seeds, every starting pose wrong).

With `p1 = 0.01` and `p2 = -0.008` in the images and the solver holding both at
zero, the surface error on the wide rig (f = 400 px) goes from 0.0018 to 0.0041
object radii, and to 0.0077 at `p1 = 0.02`. The narrow rig (f = 800 px) is half
as sensitive in surface error. Its fitted `k2` is the surprise: at `p1 = 0.02`
it comes out at +0.45 against a truth of +0.10, because `k2` is barely
identified at that range and the missing tangential term lands in it. Fitting
`p1, p2` recovers them (0.0086 and -0.0080 for 0.0100 and -0.0080) and holds the
error flat. At 2 px of pixel noise the benefit disappears.

Caveats: synthetic only, `p` is swept rather than taken from a measured
calibration, the principal point is held at the centre in both fits, so the
principal-point/tangential confound is untested. That is the next step.

Code, tests and the results table:
[`research/sensing-batan`](https://marisstella.app/research/sensing-batan/).
