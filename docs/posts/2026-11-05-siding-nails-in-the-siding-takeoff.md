---
title: "Siding nails now count in the siding takeoff"
seo_title: "Siding nails: pounds and boxes to order for lap or vertical siding"
date: 2026-11-05
tags: [wall-framing-takeoff, siding, construction]
description: "Set nails: true and the siding takeoff counts nails by run feet, spacing and rows, in pounds and boxes, and prices them in the budget."
---

The siding takeoff counted boards, house wrap, corner boards, trim, flashing and tape, and said nails were not counted. With `nails: true` it now counts them.

The sum: the feet of siding runs, over the nail spacing (default 16 in, a stud bay), times rows (1 for lap, 2 for vertical), plus one per board end, with the same waste as the boards. Nails per pound (default 200) and box weight (default 5 lb) are typed, as are `nailSpacing`, `nailRows` and `nailBoxPrice`. The budget lists "Siding nail boxes" under the price key `sidingNailBox`.

It is off by default so earlier totals do not move. The defaults are typical figures, not a siding maker's nailing schedule (check yours, and local wind rules), and the test is a hand sum. Stainless or ring-shank nail choice, and caulk and paint, are not modelled. MIT licensed in `ventures/wall-framing-takeoff`.
