---
title: "Stock size from a STEP file, without opening CAD or uploading the model"
date: 2026-11-25
tags: [for-customers, machine-shop-guides, job-shops, quoting, cnc, step-files]
seo_title: "STEP file stock size and bounding box calculator for quoting"
description: "Drop a STEP or STL file and get the bounding box, round bar, stock to cut and a first cycle time from your own feeds, in the browser. Checked against OpenCascade on 68 parts."
---

The material line of a machined-part quote starts with a question that has nothing to do with money: what stock does this come out of? The answer is in the customer's model. Getting it out usually means opening the STEP file in CAD and measuring, or uploading it to a quoting platform that reads it on its own servers. A small shop's estimator may not have a CAD seat free, and many customers would rather their drawings were not uploaded anywhere.

The new [stock size page](https://marisstella.app/machine-shop-guides/stock-size-from-step-file.html) reads the file in a browser tab. Drop a `.step`, `.stp` or `.stl` file and it gives you:

- **the bounding box**, in inches or millimetres. STEP files say their own unit and the page reads it, so an inch file is not taken for millimetres;
- **the smallest round bar along each axis**, measured about the part's own turning axis when it has one. A shaft with a 25 mm shoulder needs 25 mm bar, not the diagonal of its box;
- **stock options, smallest first**: rectangular bar or plate and round bar, each with your allowance on every side, your facing and cut-off added to the length, and sizes rounded up to 1/8 in, 1/16 in, 1/4 in, 1 mm or 5 mm;
- **weight and material cost**, if you give a density and your own price per pound, kilogram, foot or metre. One button carries that cost into the [job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html), which adds setup, programming, cycle time, outside processes and markup at each quantity break.

An STL file also gives the part's volume, so the page tells you how much of the bar becomes chips.

## A cycle time from your own feeds

Added the same day: give the page your roughing width of cut, depth of cut and feed, and your finishing stepover and feed, and it turns an STL into a first cycle time. This is the volumetric method estimators use before anyone opens CAM:

- **roughing** = the metal to remove (the first stock option's volume minus the part's volume) ÷ (width × depth × feed);
- **finishing** = the part's surface area ÷ (stepover × finishing feed);
- **cycle** = (roughing + finishing) × (1 + your allowance for rapids and tool changes) + your load and unload time.

A worked check from the tests: a 10 mm cube cut from 12 mm stock removes 728 mm³. At 2 mm × 4 mm × 91 mm/min that is 1.0 minute of roughing; its 600 mm² of surface at a 0.5 mm stepover and 120 mm/min is 10 minutes of finishing; with a 25% allowance and 1.5 minutes to load, 15.25 minutes a part. Those feeds are test inputs, not advice: every cutting field on the page starts empty, because a feed we chose would be wrong for your machine, tool and material.

The estimate counts every face as finished, so it runs long on faces left as raw stock, and it knows nothing about holes, threads or setups. The same button that carries the material cost now carries the cycle time into the quote calculator, where the factor from [quoted vs actual](https://marisstella.app/machine-shop-guides/quote-vs-actual.html) corrects it from your own past jobs. STEP files give no volume or surface area on this page yet, so the cycle time needs an STL of the same part.

## How it measures

The page does not turn the model into triangles and measure those. It reads the solid's edges.

Every corner of the part is on the part. A circular edge adds only the extremes it actually reaches: the reader follows the arc from its start to its end, the way the file says the edge runs. That matters for a concave cut. A scallop milled into the top of a block is an arc whose full circle sits mostly above the part. In our test block, counting the whole circle would make a 20 mm tall block 75 mm tall; following the arc adds nothing.

Faces on planes, cylinders and cones reach their furthest points on their edges, so for a part made of those (most prismatic and turned work) the box is exact. Spheres, fillets that wrap round a curve, and free-form B-spline surfaces can bulge past their edges. For those the reader adds a shape known to contain the surface, such as the stretch of a fillet's spine circle the face actually spans, widened by the fillet radius. It then tells you the box is an upper bound and by how much it might be over. **It never reports a box smaller than the part**: an undersized stock order costs more than a slightly oversized one.

A part the customer modelled at an angle is boxed square to its own faces and hole axes rather than to the file's axes, and the page shows both. On a bracket modelled 30° off, that is 50 × 40 × 35 mm instead of 61 × 55 × 40 mm.

## How it was checked

We built test parts in OpenCascade, the CAD kernel behind FreeCAD and several commercial tools: plates with holes and pockets, filleted blocks, stepped shafts with ball ends, a scallop cut, a rotated bracket, a flange with a bolt circle, an inch-unit plate, a turned part with a B-spline profile, and 59 randomly generated plates, shafts, blocks and rotated brackets. The kernel's own bounding box and volume are the reference.

| | Result |
|---|---|
| Parts | 68 (9 hand-made, 59 generated) |
| Box smaller than the part | 0 |
| Box exact (within 0.00001 mm) | 60 |
| Largest over-statement | 2.78 mm (B-spline profile, flagged on the page) |
| Round bar below the kernel's mesh measurement | 0 |
| STL volume vs kernel volume | within 0.2% |

The parts, the script that makes them and the comparison script are in the [source repository](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/machine-shop-guides/fixtures/geometry), so the numbers can be re-run.

## What it does not do

It does not read the drawing. A tolerance, a thread, a flatness callout or a heat-treat allowance can change the stock you need, so check the result against the PDF. An assembly file is measured part by part where each part is modelled, so export the part you are quoting. It does not price material: the density list holds typical values to edit, and the price field starts empty.

The page is free and runs in your browser; the file is never uploaded. It is the first piece of the RFQ-to-quote assistant we are building for small machine shops, which will turn a drawing and an email into a priced quote from your own rates. That product is not released yet; the [manufacturing page](https://marisstella.app/industries/manufacturing/) has early access.

*No warranty; not engineering advice. Check sizes against the drawing before ordering material.*
