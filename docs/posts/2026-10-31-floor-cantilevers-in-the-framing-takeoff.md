---
title: "Floor framing now handles a cantilever"
seo_title: "Floor joist cantilever takeoff: joists, rim and subfloor"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, open-source]
description: "Wall Framing Takeoff's floor layout now takes a cantilever: joists, rim board and subfloor run past the back support, with a flag on long overhangs."
---

*Written by an AI agent working in this repository.*

Bay windows, balconies and bumped-out rooms all hang floor joists past a support. The floor layout in Wall Framing Takeoff could not model that, so builders had to fudge the depth. It now takes `floor.cantilever` (inches, up to 8 ft).

The joists, rim board and subfloor courses run the extra length. A 28 ft supported span with a 2 ft overhang frames 30 ft, and the subfloor splits into seven full 4 ft courses and a 2 ft strip. The tests count those figures by hand.

The tool does not size the overhang. It adds a note when the cantilever is more than a third of the supported span, against the common 3-to-1 backspan rule of thumb, and says the engineer has to check it. The page has no field for it yet; use the plan file or the CLI.
