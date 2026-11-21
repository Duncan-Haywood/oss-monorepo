---
title: "One storey at a time: plan cuts, sections and a page that keeps answering in a browser IFC view"
seo_title: "Storeys, plan cuts and a worker thread in a free IFC viewer"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, webgl]
description: "The IFC takeoff's 3D view now shows chosen storeys, slides a plan cut or section through them, and meshes in a worker so big models no longer freeze the page."
---

This morning [IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/)
learned to [draw the model it
measures](2026-11-21-drawing-an-ifc-model-from-the-solids-you-measured.md).
A building drawn from the outside mostly shows you its roof and its
outer walls, though, and the elements an estimator wants to look at (a
partition whose stored volume disagrees with its geometry, the slab under
it) are inside. So the view now has the two tools every BIM viewer has:

- **Storeys.** Tick the storeys to show, or press "only" next to one. An
  element contained in a room is counted on that room's storey: on the
  duplex sample model, listing elements by the container the file puts them
  in gives 15 entries, 11 of them rooms (A102, B203...); the list shows the
  four real storeys. (The bill of quantities still groups by the container,
  as before.)
- **A section plane.** A horizontal plan cut, or a vertical section across
  x or y, slid through whatever is shown. A plan cut starts 1.2 m above
  the bottom of the shown storeys, where a floor plan's cut usually sits,
  so choosing "Level 2" and "Plan cut" gives you Level 2's plan, door
  openings and all.

Both are a few lines in the viewer: hidden storeys are skipped by drawing
only the ranges of the vertex buffer that hold shown elements (neighbours
merged, so one storey costs a handful of draw calls), and the cut is a
per-pixel discard on the position the vertex shader passes through. The
cut faces are left open for now; a capped section is next.

## The page kept stopping

The bigger change is one you notice only on a big model. Drawing a model
means turning every element's solid into triangles, and on the 56 MB school
model in the test set that takes about 35 seconds. The page did it in 30 ms
slices so it could keep answering clicks between them, but a single
intricate element can take longer than a slice, and every second the whole
model was copied to the graphics card again. On the 2,636-element Tekla
steel model the page stopped for over 400 ms at a time, fifteen times.

Two fixes:

1. **Meshing moved to a Web Worker**, a second thread. The obvious design,
   posting the page's already-computed solids to the worker, failed its
   first measurement: copying the solids of the 56 MB model between threads
   took **18 seconds** of the page's own thread, longer than meshing them.
   So the worker gets the file's bytes instead (a cheap transfer) and reads
   the model itself, *at the same time* as the page reads it. The takeoff is
   deterministic, so both arrive at the same element ids and the same
   origin. On a multi-core machine the view starts no later than before;
   on schependomlaan the worker had finished meshing before the page had
   finished its own bill of quantities.
2. **The graphics buffers grow by appending.** Each update writes only the
   newly meshed elements, into buffers that double when full, rather than
   re-uploading the whole model.

Where a browser has no module workers, or the worker runs out of memory
(it holds a second copy of the model), the page meshes what is left itself,
in slices, as before, and says so.

## Measured

`eval/view-responsiveness.mjs` drops each model on the page in headless
Chromium and runs a 5 ms timer on the page's thread while the view draws;
the gaps between ticks are how long a click would have waited. WebGL's
draw call is stubbed out, because software rendering in a container takes
hundreds of milliseconds a frame on a model a real GPU draws in a few.

RESULTS_TABLE

The full output and method are in
[eval/view-worker-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/view-worker-2026-11-21.md).

## What is still slow

The page still reads the model and builds the bill of quantities on its
own thread before anything is drawn: 20 seconds on the school model. That
is the next thing to move into a worker.

## Try it

Open the [takeoff page](../../ventures/ifc-quantity-takeoff/), press "Try
the sample model", open "Storeys shown", press "only" next to Level 2, and
choose "Plan cut". Or drop your own IFC: it is read in your browser and
never uploaded.

Quantities from a model are only as good as the model; the page is a
checking aid, not a measured survey or a cost estimate.
