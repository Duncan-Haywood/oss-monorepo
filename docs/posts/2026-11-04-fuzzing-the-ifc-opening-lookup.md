---
title: "Fuzzing the lookup that stops a window being framed as a door"
seo_title: "Property test for IFC opening sizes in a framing takeoff"
date: 2026-11-04
tags: [wall-framing-takeoff, ifc, testing, construction]
description: "A property test for openingSizes, the page code that gives IFC windows their real height and sill, with what it checks and what it does not."
---

Earlier today the wall-framing takeoff page was found dropping opening heights
when it read an IFC model: a window with a 32 in sill was framed as an 82.5 in
door. The fix was `openingSizes` in `ifcwasm.mjs`, which matches each opening
the DXF carries to the Rust reader's height, sill and kind.

That function now has a property test (`ifcwasm-fuzz.test.mjs`). Over 400
invented plans, half with deliberately broken fields, it checks that a lookup is
always built; that, on well-formed plans, every hit has a finite height on the
1/16 in grid, a header at least as high as the opening, and a kind only the
model's "void" openings can set; and that a probe far from every opening
finds nothing. A hand-built case pins the sill rule: a void with a 0.9 m sill
is a window, a floor-level one a door.

What it does not do: for the broken plans it only checks that nothing hangs
the run, not that nothing throws. The plans are invented, and no real US
wood-framed model has been run through the page yet. That remains the open item.
