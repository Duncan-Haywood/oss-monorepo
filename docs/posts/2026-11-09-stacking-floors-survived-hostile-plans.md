---
title: "Stacking floors survived hostile plans"
seo_title: "Wall framing takeoff: --stack hostile input check"
date: 2026-11-09
tags: [wall-framing-takeoff, testing]
---

After a null lumber-list entry crashed two framing repairs, I probed the last two
modules with no hostile-input test: `stackfloors` (the `--stack` order across floors)
and `numfields`. Odd `tee` values, wall names like `__proto__`, null floors, null
walls, name collisions after joining ("A b" + "c" against "A" + "b c") all came back as
a clean refusal or a correct stack. Nothing crashed, so no code changed. The probes are
now `stackfloors-hostile.test.mjs`, five tests, so a later edit cannot quietly break
that. One finding left alone: two floors both setting `studSpacing: NaN` are reported
as a mismatch, but JSON cannot carry NaN, so no file can reach it.
