---
title: "Shed Designer now hands you the shed as a 3D model file"
seo_title: "Download your shed design as a glTF 3D model (.glb), free"
date: 2026-11-15
tags: [shed-designer, construction, 3d, gltf, open-source]
description: "A new button exports the framed shed as a binary glTF file: each board a named piece, grouped by layer, at full size. It opens in Blender and Windows 3D Viewer."
---

[Shed Designer](https://marisstella.app/shed-designer/) frames a backyard shed
board by board and draws it in 3D in the browser. Until today the 3D view
stayed inside the page. You could turn it and save a picture, but you could
not take the model anywhere else. Now there is a **3D model (.glb)** button
beside "Save picture".

## Why this one

Of the portfolio's pages, Shed Designer is the tool that gets real visits: 20
page loads between 2026-10-24 and 2026-11-03, more than any other tool page
(`portfolio/usage/site-visits.json`, which counts page loads, not people).
People who design a shed usually want to see it somewhere else too: in their
yard on a model of the house, in Blender to light it, or sent to someone who
will build it. A picture is flat. A model file can be turned, measured and
taken apart.

## What is in the file

The file is binary glTF 2.0, the open format from the Khronos Group. Blender,
Windows 3D Viewer, three.js and Google's `<model-viewer>` all open it without
a plug-in.

- **Every piece is its own named node.** On the 8x12 a stud is "Stud F1, 2x4" and a
  rafter is "Rafter RF1, 2x6". Siding panels, sheathing, trim, doors and windows have
  the names the tool's click panel already gives them.
- **Pieces sit under one node per layer**: foundation, floor, walls, roof
  framing, sheathing, siding, roofing and trim. In Blender you can hide the
  siding and look at the frame, or pick one header and read its size.
- **Full size, in metres, Y up**, as glTF asks. The tool works in inches with z
  up, so the export scales and turns every point and keeps the handedness.
- **The same geometry as the 3D view.** Each board is the extruded profile the
  viewer draws, birdsmouths and angled gable-stud tops included. A test checks
  that the file has exactly as many triangles as the viewer draws.
- The windows use a see-through material. Every face draws both sides, because
  the profiles are not all wound the same way.

The nine starting designs come out at 211 to 547 KB. The export code is loaded
only when you click the button, so the page itself is no heavier.

## How it was checked

- `gltf.test.mjs` runs on every preset. It reads the file back and checks that
  the chunks are aligned and the stored lengths are right. It checks that each
  accessor's minimum and maximum match its data, since validators reject a
  mismatch. It checks that every drawn piece is in the file. On the 8x12 it
  checks that the floor frame is 12 ft by 8 ft and the top is at the peak.
- All nine preset files went through the Khronos
  [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) (npm
  `gltf-validator` 2.0.0-dev.3.10): 0 errors and 0 warnings on each.
- The 8x12 file was also loaded in three.js, a renderer that shares no code
  with the tool. It came out 3.76 m long overall (12 ft plus the overhangs) and
  showed the expected nine layer groups.
- A browser test clicks the button in headless Chromium and checks that the
  download is a glTF file whose header holds the right length.

## What it is not

It is a picture of the design in three dimensions, not a BIM model. The pieces
carry names but no structural properties, and nothing in the file is
engineered or code-checked. The plans, cut sheet and structure checks are
still where the build numbers live.

## Next

If people use it (the page counts `models-saved` in the browser's own storage,
and you can switch that off), the next step is probably IFC. That is the
building industry's open model format, so each stud and rafter would arrive as
a typed framing member a BIM tool understands. A USDZ copy would let an iPhone
place the shed in the yard in AR.

The code is MIT licensed: `ventures/shed-designer/gltf.mjs` in the
[repository](https://github.com/Duncan-Haywood/oss-monorepo).
