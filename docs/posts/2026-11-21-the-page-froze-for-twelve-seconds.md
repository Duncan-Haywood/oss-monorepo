---
title: "The page froze for 12 seconds: moving an IFC takeoff into a Web Worker"
seo_title: "Moving a browser IFC takeoff into a Web Worker"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, performance]
description: "IFC Quantity Takeoff now reads models in a Web Worker. On a 56 MB model the longest freeze went from 11.7 s to 0.7 s, and the copy back costs 27 ms."
---

Earlier today [IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/)
moved the meshing for its 3D view into a Web Worker, a second thread
([the post](2026-11-21-keeping-a-browser-ifc-view-responsive.md)). It
ended on what was still slow: before anything showed, the page read the
model and built the bill of quantities on its own thread. On the 56 MB
school model in the test set, the tab froze for **11.7 seconds** after you
dropped the file. You could not scroll, and the browser could have warned
that the page was not responding.

## The worker already had the answer

The worker that meshes the view needs each element's solid, so it was
already reading the file and running the whole takeoff, at the same time
as the page ran the same takeoff. The page could just take the worker's
result. The catch, measured last time: copying the solids from one
thread to another took 18 seconds, longer than the work it saved.

But the page does not need the solids. It needs the rows: the stored and
computed quantities, the checks, the storey, the Uniformat code. And the
takeoff already keeps each row's solid, placement and length unit as
*non-enumerable* properties, so they stay out of CSV exports and JSON.
Structured cloning, the copy a worker message makes, skips
non-enumerable properties too. So the worker posts the takeoff as it is,
and only the rows cross: 6 MB, read in **27 ms** on the school model. The
solids stay in the worker, which goes on to mesh them.

## Checking nothing was lost

A copy that drops something the page needs would show up as a wrong
number in a bill of quantities, not as an error. So before wiring it in,
I compared every output the page makes from the copied takeoff with the
page's own: the element CSV, the bills of quantities by class, storey,
Uniformat and material under each rule for small openings, the storey
list, the view's origin and a revision comparison. On seven models, all
were byte for byte the same. A test now runs the worker file itself and
checks the same on the sample model.

## Measured

`eval/takeoff-responsiveness.mjs` drops each model on the page in
headless Chromium and runs a 5 ms timer on the page's thread; the gaps
between ticks are how long a click would wait.

| Model | Longest freeze while reading | View drawn, seconds after the drop |
|---|---|---|
| Duplex, 215 elements | 825 ms → 117 ms | 1.9 → 1.6 |
| kleine_Wohnung, 425 elements | 4,283 ms → 248 ms | 7.1 → 6.7 |
| Tekla steel, 2,636 elements | 3,695 ms → 310 ms | 9.9 → 9.9 |
| School, 56 MB, 4,459 elements | 11,660 ms → 681 ms | 46.9 → 35.0 |

The view also finishes sooner on the big model, because the model is now
taken off once rather than twice in parallel. That halves the work and the
memory.

## What is left

One gap remains on every model: the moment the result arrives, the page
builds the summary, the bill of quantities and the checks table in one go.
On the school model that is 0.7 seconds, nearly all of it building tables.
That is the next thing to split up. Browsers without module workers, or a
worker that runs out of memory, get the old behaviour: the page reads the
model itself. The method and every row are in
[eval/takeoff-worker-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/takeoff-worker-2026-11-21.md).

## Try it

Open the [takeoff page](../../ventures/ifc-quantity-takeoff/) and drop an
IFC file. It is read in your browser and never uploaded, and the page now
counts the seconds while it reads.

Quantities from a model are only as good as the model. The page is a
checking aid, not a measured survey or a cost estimate.
