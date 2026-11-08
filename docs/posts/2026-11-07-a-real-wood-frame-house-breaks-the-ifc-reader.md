---
title: "A real wood-frame house breaks our IFC reader in useful ways"
date: 2026-11-07
description: "We ran a real US wood-frame house through the framing takeoff: 30 of 102 first-floor walls were concrete, and doors at wall ends still block framing."
tags: [construction, ifc, wall-framing-takeoff]
---

Our wall framing takeoff had only read masonry buildings from real IFC files. This week we ran a US wood-frame house, OpeningDesign's Schultz Residence (a Revit export with 105 walls, 17 doors and 25 windows).

Three things showed up. Eight of its 11 "storeys" are Revit reference planes, so the floors have to be picked by name. The 1st Floor lists 102 walls, and 30 of them are concrete foundation or retaining walls that would otherwise be framed as 2x4 studs; a new `--wood-only` switch in the Rust reader drops them and keeps walls with no layer data. And even then the takeoff refuses both floors, because doors sit at 0 in on short walls and one window wall lists several fills twice at the same offset.

So this is a reader test, not a framing result: no order was priced and no framer's takeoff was compared. The model is licensed no-derivatives, so it is not in the repository; the README says where to fetch it. Code and notes are in `ventures/wall-framing-takeoff/`.
