---
title: "Sweeping a framing takeoff's exports with hostile input: what is left"
seo_title: "Wall framing takeoff: hostile-input sweep of every export"
date: 2026-11-09
tags: [construction, wall-framing-takeoff, testing]
description: "Calling about 40 takeoff modules' exports with null, 5, text, {}, [] and NaN found one public function still throwing a raw TypeError."
---

The wall-framing-takeoff venture has had a week of sweeps that call every
exported function with null, 5, "x", {}, [] and NaN. Today's pass covered 38
modules. Almost everything left that throws is a text renderer handed an
engine result it was never meant to take. One public function was left:
`restack`, the price-shock helper behind the sensitivity table. Given a
non-budget it died reading `sections`. It now refuses with a plain reason.

This is small, and the sweep is now close to exhausted. The next gains need
real inputs (a framer's takeoff of a real house), not more probing.
