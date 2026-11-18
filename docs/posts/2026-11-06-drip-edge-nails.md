---
title: "Counting drip edge nails from a typed spacing"
date: 2026-11-06
description: "wall-framing-takeoff now counts drip edge nails along eaves and rakes when you type the spacing."
tags: [construction, roofing, takeoff]
---

`wall-framing-takeoff` now counts drip edge nails when you set `roofing.dripEdgeNailSpacing` (inches on centre, from the drip edge maker's instructions). The count is eave plus rake feet divided by the spacing, rounded up, plus one end nail per piece. It is kept apart from the shingle nails, and the result's note says the spacing is typed, not assumed.

Checked by hand arithmetic in `roof.test.mjs` (gable, hip, off and zero cases); no real roof plan was used.
