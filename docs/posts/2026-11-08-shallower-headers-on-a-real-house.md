---
title: "Shallower headers on a real house: 20 of 20 walls on the 2nd Floor"
date: 2026-11-08
tags: [construction, framing, ifc, open-source]
description: "Re-running the wall-framing takeoff's --shallow-headers flag on OpeningDesign's Schultz Residence frames every wall of the 2nd Floor and 19 of 20 on the 3rd."
---

The wall-framing takeoff refuses a whole wall when a header is deeper than the room under the plates. This morning we added `--shallow-headers`, which swaps in the deepest listed header that fits. It had only been tested on a hand-built wall. Today we ran it on the real thing: OpeningDesign's Schultz Residence, a 22 MB Revit export.

Result, with `--wood-only --drop-frame-stubs --skip-refused`: the 2nd Floor now frames all 20 walls (192.4 ft, 344 pieces, 192 boards, cost 2417.12 against a 2414.89 lower bound). The 3rd Floor frames 19 of 20 (210.0 ft, cost 2713.44). The 1st Floor is unchanged.

The two walls that still stop are not header problems. On 3rd Floor Int 14 the door is 1.25 in taller than the room under the plates. On 1st Floor Int 7 there is 0.63 in of room and the door does not reach the floor. Those need a decision in the source model.

Limits: the swapped 2x4 and 2x6 headers over 35 in openings are placeholders for a span table, not designs. The board price is a per-foot guess and no framer's takeoff was compared. Details are in the venture README.
