---
title: "Revit writes one opening per cut, so we merge them"
date: 2026-11-07
description: "On a real Revit wood-frame house, bare voids sat under the doors and windows that fill them. The IFC reader now drops and merges them."
tags: [construction, ifc, wall-framing-takeoff]
---

Last run, a whole wood-framed Revit house (the Schultz Residence) made our takeoff refuse both floors. A suspected cause was duplicate fills. The real cause was one level down: Revit writes one opening element per cut.

On the 1st Floor `Window Wall`, a bare void 0 to 1.97 m wide sat under a door and a window that already fill it, so the wall counted a rough opening twice. Elsewhere, one passage was cut as three touching voids.

`ifc-engine` now drops a void that fills cover by 80% or more of its width, and merges voids that touch. The wall has 13 openings instead of 14, and the three voids are one 1.25 m passage. A hand-written IFC test covers both, and the WASM behind the page's IFC upload is rebuilt.

What it does not fix: that passage reaches the start of `Int 4` with a tee wall landing inside it, and the CLI still refuses it, correctly. The stacked casement-and-awning units in a window column are separate real units and stay separate. No framer's takeoff has been compared yet.
