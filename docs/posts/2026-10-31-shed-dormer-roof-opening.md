---
title: Shed dormers now frame the hole they cut in the roof
date: 2026-10-31
description: "Shed dormers in the wall-framing takeoff now frame the opening they cut in the main roof: doubled headers, doubled trimmers and a count of cut rafters."
---

The wall-framing takeoff framed a gable dormer's front window and the opening it
cuts in the main roof. The shed dormer, the plain single-slope box builders add
for headroom, got its front window earlier today. It now also gets the roof
opening: doubled up- and downslope headers, doubled trimmers and a count of the
main rafters it cuts, with the same `roofOpening` keys as the gable dormer.

The check is hand arithmetic: a 12 ft shed on an 8:12 roof, 3:12 shed pitch and
a 4 ft front wall, meets the main roof 115.2 in back and cuts five rafters at
24 in. No real dormer plan stands behind it, and the header and trimmer load
checks stay with the engineer.

Code: `ventures/wall-framing-takeoff/dormer.mjs`.
