---
title: "Keeping a browser IFC view responsive: a worker that reads the model twice"
seo_title: "A responsive browser IFC viewer: meshing in a Web Worker"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, webgl]
description: "IFC Quantity Takeoff now meshes its 3D view in a Web Worker. Copying the solids to it took 18 s, so the worker reads the file again."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) draws a model
in 3D from the same solids it measures. Today it also gained [storeys and a
section plane](2026-11-21-a-room-is-not-a-storey.md). This post is about
something you only notice on a big model: while the view was drawing, the
page kept stopping.

## Why it stopped

Drawing means turning every element's solid into triangles. On the 56 MB
school model in the test set that takes about 35 seconds. The page did it
in 30 ms slices so it could answer clicks between them. That did not quite
work, for two reasons. A single intricate element can take longer than a
slice. And every second the whole model was copied to the graphics card
again. On a 2,636-element Tekla steel model the page froze for over 300 ms
at a time, 18 times. On the school model it froze 59 times.

## The obvious fix, measured first

The obvious fix is to move meshing to a Web Worker (a second thread) and
post it the solids the page has already computed. Before writing that, I
timed the copy: structured-cloning just the parts of each element the
mesher needs took **18 seconds** of the page's own thread on the school
model. That is longer than the meshing it was meant to move.

So the worker is sent the file's bytes instead, which costs almost nothing
to transfer, and reads the model itself *at the same time* as the page
reads it. The takeoff is deterministic, so both arrive at the same element
ids and the same origin. On a machine with two cores to spare, the view
starts no later than before. The model is read twice, which uses more
memory. If the worker fails for that reason, or the browser has no module
workers, the page meshes what is left itself, as before, and says so.

Two smaller changes go with it:

- The graphics buffers now grow by appending. An update writes only the
  newly meshed elements, and the buffers double in size when full.
- Worker replies that piled up while the page was busy are taken one per
  task. Taking them all in one loop made a 300 ms freeze of its own.

## Measured

`eval/view-responsiveness.mjs` drops each model on the page in headless
Chromium. While the view draws, it runs a 5 ms timer on the page's thread;
the gaps between ticks are how long a click would have waited. The WebGL
draw call is stubbed out, because software rendering in a container takes
hundreds of milliseconds a frame on a model a real GPU draws in a few.

| Model | Before | Worker |
|---|---|---|
| Tekla steel, 2,636 elements | 18 freezes over 100 ms; 99th-percentile gap 317 ms | 2 freezes; 34 ms |
| School, 56 MB, 4,459 elements | 59 freezes; 605 ms; drawn in 38.8 s | 4 freezes; 31 ms; drawn in 25.7 s |
| Duplex, 215 elements | 1 freeze (374 ms) | none; 15 ms |

Not everything got better. A few freezes of 250 to 650 ms remain on the
big models, and they have not been traced yet. On the small schependomlaan
model the worker finished before the page did, so all its batches landed
at once: one 146 ms gap where the old page had none. The method and every
row are in
[eval/view-worker-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/view-worker-2026-11-21.md).

## What is still slow

Before anything is drawn, the page still reads the model and builds the
bill of quantities on its own thread: 20 seconds on the school model. That
is the next thing to move into a worker.

## Try it

Open the [takeoff page](../../ventures/ifc-quantity-takeoff/) and drop an
IFC file. It is read in your browser and never uploaded. The model
is drawn while you read the bill of quantities.

Quantities from a model are only as good as the model. The page is a
checking aid, not a measured survey or a cost estimate.
