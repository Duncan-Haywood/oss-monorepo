---
title: "One Lumber Order for a Whole House: stacking floors from a real model"
seo_title: "Stack Floors Into One Lumber Order From an IFC Model"
date: 2026-11-08
tags: [wall-framing-takeoff, ifc, construction]
description: "Three floors of a real house model, framed separately, buy three lumber orders. Stacked, they buy one, and it costs 0.28% less."
---

The [wall framing takeoff](/ventures/wall-framing-takeoff/) could already frame each floor of OpeningDesign's Schultz Residence. But each floor was its own cutting-stock order, so offcuts from one floor never became pieces on the next.

`--stack` merges floors into one order, but it only took plan JSON, which has no room for a model's wall heights. It now takes DXF floors too, each with its own `--ifc-json` file.

On the Schultz model (49 wood walls, 978 pieces) the single order costs 6175.20, 0.23% over its lower bound. The three floors ordered apart cost 6192.56. That is 17.36 less, 0.28%. The gain is small because each floor already wastes under 1.2%; the bigger win is one order instead of three.

The 20 ft board price is a per-foot guess, and lowered doors, cut doors and swapped headers are placeholders for fixes in the source model. No framer's takeoff was compared, so read the saving as a hint, not a quote.
