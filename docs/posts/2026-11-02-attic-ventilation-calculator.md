---
title: "An attic ventilation calculator that shows its arithmetic"
seo_title: "Attic ventilation calculator: ridge and soffit vents, 1/150 rule"
date: 2026-11-02
tags: [construction, wall-framing-takeoff, calculators, seo]
description: "A free browser calculator for how much attic ventilation a roof needs and how to split it between ridge and soffit vents, built on the takeoff's tested engine."
---

The wall-framing takeoff has counted attic ventilation since 1 November, but only from the command line. Today it got a page of its own: `ventilation-calculator.html`.

Type the attic's length and width, pick the 1/150 or 1/300 rule, and enter the net free area (NFA) printed on the vents you plan to buy. The page returns the required area, the feet of ridge vent and the number of soffit vents, and says when the eaves cannot hold that many.

A worked case, checked by hand in `page.test.mjs`: a 24 x 40 ft attic is 960 sq ft, which at 1/150 is 921.6 sq in. Half of that high is 460.8 sq in, which is 25.6 ft of ridge vent at 18 sq in per foot, so seven 4 ft pieces. The other half needs nine soffit vents of 56 sq in. At 1/300 the need halves to 461 sq in.

What it does not do: decide which ratio your house falls under (that is for you and your inspector), know any maker's real NFA (the defaults are placeholders), or count gable, box or power vents. Those limits are printed on the page. Nothing leaves the browser.
