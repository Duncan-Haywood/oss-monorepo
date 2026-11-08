---
title: "Which way should the carpet roll run? A takeoff option that checks both"
seo_title: "Carpet roll direction: fewer linear feet for a 14 x 13 ft room"
date: 2026-11-05
tags: [wall-framing-takeoff, flooring, construction]
description: "The flooring takeoff always ran the roll along the long side. An opt-in setting now tries both directions and keeps the one that uses less carpet."
---

The carpet takeoff in `wall-framing-takeoff` cut every room from a 12 ft roll with the roll running along the room's long side. For a 14 x 13 ft room that is two strips of 174 in (168 in plus a 6 in trim allowance), or 29 linear feet.

Running the roll the other way gives two strips of 162 in (156 in plus 6 in), or 27 linear feet, with the same single seam. The new setting `carpet.rollDirection: "best"` tries both directions per room and keeps the one with fewer linear inches, preferring fewer seams on a tie. The default is unchanged, so existing plans give the same numbers.

The 27 and 29 ft figures are hand arithmetic, checked in `flooring.test.mjs`. It does not model nap direction, pattern match or where a seam may sit, and no real carpet order was checked.
