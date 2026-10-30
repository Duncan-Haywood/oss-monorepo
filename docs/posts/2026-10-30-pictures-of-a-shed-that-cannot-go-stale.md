---
title: "Pictures of a shed design that can't go stale"
date: 2026-10-30
tags: [shed-designer, rendering, testing]
description: "Thirty renders of six shed designs from the tool's own WebGL viewer, 353 KB in all, and a test that fails when the design or renderer moves on without them."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) is getting a gallery of ready-made designs to flick through. A gallery needs pictures. Pictures in a repository usually go stale: someone changes the framing or the colours, and the screenshot on the marketing page shows last month's shed.

**Where the pictures come from.** The pictures are not mock-ups. A script, `make-renders.mjs`, loads each preset into the same WebGL viewer the tool uses, in headless Chromium, and saves five views:

- a hero from the front corner;
- front, gable end and back;
- a framing cutaway with the siding, sheathing and roofing taken off.

Each view is drawn at twice its size and scaled down, because software GL draws jagged edges otherwise. It is then saved as WebP at the highest quality from 0.8 down that fits its budget. Six designs come to 30 files and 353 KB. The heroes are 22 to 25 KB, the flat elevations 5 to 7 KB, and the framing views 18 to 21 KB.

**Why we hash the scene, not the pixels.** We could compare pixels, but software rendering differs slightly from machine to machine. Instead, each design gets a scene hash. It covers the triangles and colours the viewer would upload, rounded to a thousandth of an inch, plus the shader source, the draw loop and the camera list. A test rebuilds every design and compares hashes.

- Change a stud's length or a siding colour and the test fails, naming the design and the command that redraws it.
- Change a price, a name or the tax rate and nothing happens, because none of them is in the picture.

About twenty agents are working on this tool at once, so a test that failed on unrelated edits would be ignored within an hour.

**What we learned the first afternoon.** Two things happened within an hour of the pipeline existing:

- *Another lane changed the renderer's draw loop* for a structural heat map. The hash went stale, and the redraw gave byte-identical WebP files, because SwiftShader is deterministic on one machine. Only the manifest's hashes changed, so the repository did not grow.
- *The looks lane added a sky, grass, contact shadows and siding texture.* That redraw did change every picture, and it is the one we wanted to catch. The pictures doubled in size, from 236 KB to 353 KB, because grass and board texture are detail the encoder has to keep.

**Alt text is written from the design.** The 8x12 classic's hero reads: "3D render of the 8x12 gable shed, 8 by 12 ft, seen from the front corner: stained T1-11 panel siding, charcoal shingles, 6/12 roof, 11' 4-5/8" to the peak, showing a 38" door on the front (eave side)." The peak height comes from the framing engine. When a redraw changes that number, the script rewrites the alt attribute on every page that shows the picture, and the test checks the page and the manifest still agree.

The worked example on the [8x12 lumber page](https://duncan-haywood.github.io/oss-monorepo/shed-designer/shed-plans-with-cut-list.html) now shows its shed finished and framed. The gallery, the size pages and the HOA sample packet come next.

The renders show the design, not a built shed. Shed Designer is not engineered or code-checked; check your local rules before you build.
