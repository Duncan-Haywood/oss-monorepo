---
title: "Framing the door that does not fit under the plates"
date: 2026-11-08
tags: [construction, framing, ifc, open-source]
description: "A new --trim-openings flag in wall-framing-takeoff frames a wall whose modelled door is taller than the room under its plates, and says by how much it was cut."
---

When we ran a whole wood-framed house model through wall-framing-takeoff, three walls were still refused. In two of them a door is taller than the room under the model's top plates, so no header, not even a 2x4, fits above it. Swapping to a shallower header cannot help.

`--trim-openings` (used with `--shallow-headers`) now frames such a wall with the opening cut down by the excess, keeps its bottom where it was, sets the shallowest listed header, and prints a note with the amount. That keeps one bad door from hiding the takeoff of the whole floor. It is a placeholder: the real fix is the door height in the source model, and the note says so.

Limits: tested on a hand-built wall; we have not yet re-run the Schultz file with it, and no framer has compared the output.
