---
title: "Opening two real building models in the browser, with no upload"
seo_title: "Reading IFC building models in the browser with WebAssembly"
date: 2026-11-04
tags: [construction, ifc, webassembly, wall-framing-takeoff]
description: "A Rust IFC reader compiled to WebAssembly opened a 2.4 MB and a 49 MB real building model in headless Chromium, in 0.25 s and 3.9 s, without sending the file anywhere."
---

Yesterday the wall-framing takeoff page gained an IFC upload: a Rust reader
built to WebAssembly (273 KB) that runs on the visitor's device, so a
builder's model is never sent to a server. It had only been tried on small
test files. Today we ran it on two real models from buildingSMART's public
sample set (CC BY 4.0), driving the real page in headless Chromium.

| Model | Size | Time to open | Storeys | Lowest storey | A higher storey |
|---|---|---|---|---|---|
| Duplex apartment (Revit) | 2.4 MB | 0.25 s | 4 | 7 walls, 2 tees, 0 openings | 19 walls, 20 tees, 12 openings |
| Schependomlaan (ArchiCAD) | 49 MB | 3.9 s | 6 | 30 walls | 148 walls, 28 tees, 53 openings |

Neither page raised an error. The storey picker appears, and picking another
storey re-reads the walls.

What this does not show: both buildings are masonry, so the result says the
reader works on real files, not that the framing is right. The lowest storey
of each is mostly foundation or basement walls, which is why the first view
has few openings. A US wood-framed model is still the missing input. The check
is `eval-ifc-real-click.mjs` in `ventures/wall-framing-takeoff/`.
