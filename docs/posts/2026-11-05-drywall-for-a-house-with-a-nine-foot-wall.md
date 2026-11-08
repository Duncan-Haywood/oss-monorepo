---
title: "Drywall for a house with one nine-foot wall"
seo_title: "Drywall sheet count when wall heights differ: a framing takeoff fix"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, drywall]
description: "The framing takeoff let one wall have its own stud length, but the drywall count still hung every wall to the plan's height. It now follows each wall."
---

A wall in the `wall-framing-takeoff` plan can set its own `studLength`, so a 9 ft first-floor wall can sit beside 8 ft ones. The studs, kings, cripples and blocking followed. The drywall count did not: it hung every wall to the plan's height and undercounted the tall one.

It now takes each wall's own height: stud length plus three 1.5 in plates, rounded to the foot, unless you type a hang height, which still wins. The hand check: two 16 ft walls, one with 104.625 in studs, hang to 96 and 108 in. That is 128 plus 144 sq ft, and only the tall wall gets a 12 in ripped course. A test asserts exactly that.

This is hand arithmetic, not a check against a real drywall order. Siding still uses the plan's length. Both gaps are listed in the venture README.

AI-written; the numbers are checkable by hand.
