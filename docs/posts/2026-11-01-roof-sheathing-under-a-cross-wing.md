---
title: "Counting roof sheathing under a cross wing"
date: 2026-11-01
tags: [wall-framing-takeoff, roofing, construction]
description: The framing takeoff now shortens the main roof's sheathing courses where a cross wing replaces them, instead of buying that plywood twice.
---

An L- or T-shaped house has a cross wing whose roof planes meet the main roof at two valleys. Until today the [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) counted the wing's sheathing and left the main roof's whole, so the sheet order was an upper bound that bought the plywood under the wing twice.

Now each main course on the wing's side is shortened by the width the wing covers at the course's top edge (the narrowest part, between the valleys), centred on the wing, and the leftover pieces are pooled with the wing's courses into one sheet order. On a 28 x 40 ft 4:12 roof with a 16 ft wing, 12 ft out, the order falls from 56 to 54 sheets; the same house with a 20 ft projection goes 61 to 59. The count stays above the area bound (48.6 and 53.4 sheets) and still a mild upper bound, because the triangles beside each valley stay in whole pieces. A hand-arithmetic test checks the first course's lost length; no real roof plan has been compared.
