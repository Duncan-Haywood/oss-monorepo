---
title: "A 37 inch wall with a 32 inch door in it"
date: 2026-11-07
description: "A real Revit house exports door jambs as short walls; a new ifc-engine flag drops them, clearing one of three 2nd floor refusals."
tags: [construction, ifc, wall-framing-takeoff]
---

The Schultz Residence is a real Revit house, and the framing takeoff still refuses its upper floors. Looking at why, two of the walls turned out to be door frames the architect modelled as walls: one 37 inches long holding a 32 inch door, another 54 inches long with a door 45 inches wide. No framer builds those as walls, and the takeoff cannot fit king and jack studs into them.

`ifc-engine` now has `--drop-frame-stubs`, off by default. It drops walls under 1.2 m long that are more than 75% door or window, and says how many it dropped. On the 2nd Floor that clears one of three refusals. The other two (a door at 0 in on another wall, two tees 0.1 in apart) and both 3rd Floor refusals are still there, and the 3rd Floor door sits on a 3.5 m wall, so it is a different problem. The thresholds come from this one house, and no framer's takeoff has been compared with the result.

Notes and the test are in `ventures/wall-framing-takeoff/README.md` and `ifc-engine/tests/fixtures.rs`.
