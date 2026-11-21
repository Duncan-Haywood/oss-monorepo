---
title: "Three in four overlapping pairs were empty: a faster IFC takeoff, same bytes"
seo_title: "Faster IFC quantity takeoff in the browser, byte-identical output"
date: 2026-11-21
tags: [ifc-quantity-takeoff, performance, bim, geometry]
description: "Our in-browser IFC takeoff ran 17.5% faster over 28 public models, with byte-identical results, after we stopped clipping polyhedra that could not meet."
---

The [IFC quantity takeoff](/ifc-quantity-takeoff/) reads a building model in
your browser and works out volumes and areas from the geometry. It does not
trust the figures the authoring tool stored. On the largest public test
models, that took 15 to 30 seconds before the 3D view could start.

We profiled it on 28 public models from the `engine_web-ifc` test set. On
a Norwegian school model, a quarter of the time went into joining
overlapping parts of one element, so that a shared corner isn't counted
twice. That step intersects every pair of convex pieces whose bounding boxes
overlap. 116,504 pairs passed the box test. **86,849 of them, three in four,
had nothing in common**: the boxes overlapped, but the shapes did not.

Intersecting two convex pieces means cutting one by each face plane of the
other. A pair that doesn't meet gets cut down to nothing, building and
throwing away copies of the faces on the way. Now, before cutting, we check
whether one plane already has every point of the other piece well beyond it.
If it does, the answer is "nothing in common" without building anything. The
margin is twice the cut's own tolerance, so the shortcut fires only where the
full cut would also come back empty.

Two smaller fixes did the rest. Matching up the edges of faceted shells built
a text key for every vertex, like `"1250.5,-30,2700"`. It now looks the
numbers up directly. And a function called up to 200 times per element went
through a JavaScript generator; it now uses a plain loop.

The rule for this kind of change is that **only the time may change**. Over
all 27 models the tool reads (the 28th is a bridge that uses a placement
type we don't read yet), the JSON and CSV outputs are byte-for-byte the same
as before. A new test checks each shortcut against a verbatim copy of the
code it replaced, on thousands of random shapes.

| Model | before | after |
|---|---:|---:|
| School (ARK_NUS, 57 MB) | 17.7 s | 14.1 s |
| Digital Hub (MEP fittings, 14 MB) | 16.4 s | 12.5 s |
| Small flat (kleine_Wohnung) | 7.3 s | 4.6 s |
| All 28 models | 138.9 s | 114.5 s |

Garbage collection is still more than a quarter of the time. The next step
is fewer small arrays, not a faster language. The full reading is in
[the perf history note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-21-ifc-takeoff-clip-and-orient.md).
