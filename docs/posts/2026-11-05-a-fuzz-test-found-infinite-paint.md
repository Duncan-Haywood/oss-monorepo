---
title: "A fuzz test found a paint estimate of infinite gallons"
seo_title: "Fuzz testing a paint takeoff: infinite gallons from one bad ceiling"
date: 2026-11-05
tags: [construction, testing, wall-framing-takeoff]
description: "The paint module of the open wall-framing takeoff tool had no fuzz test. Writing one found a ceiling width that produced Infinity gallons."
---

Most modules in the open [wall-framing takeoff](../../ventures/wall-framing-takeoff/README.md) tool have a seeded fuzz test: 400 to 500 random inputs, each of which must be refused with a reason or give finite, non-negative quantities. The paint module (`paint.mjs`) was one of the few without one.

I wrote one (`paint-fuzz.test.mjs`, 500 seeds, including wrong-typed settings). It failed within the first 60 seeds. A ceiling with an infinite width passed the `width > 0` check, so the estimate came back as `Infinity` gallons for paint and primer. The same check let a numeric string such as `"9"` through by coercion.

The fix is in the ceiling validator: width and depth must be real numbers, above 0 and at most 100,000 inches. The fuzz test and the existing paint tests now pass. Paint is a small module, but an estimate that prints "Infinity gallons" in a bid is the kind of fault a contractor notices and then stops trusting.
