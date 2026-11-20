---
title: "One void threshold for every element moved slab areas on 4 of 11 models"
seo_title: "Void thresholds per work section in an IFC takeoff"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now sets small-void thresholds per work section. One pair for everything added up to 7.2 m2 of slab area that a volume rule leaves alone."
---

Earlier today the free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
learned to leave small openings in, the way a method of measurement does. A
pipe sleeve under some size isn't deducted from a wall's plaster or a slab's
concrete. That first version took one pair of numbers for the whole model,
an area threshold and a volume threshold.

Methods of measurement don't work that way. The threshold depends on the
work section, and so does the figure it's judged by. Masonry voids are judged
by area. In-situ concrete voids are judged by volume. Finishes have their own
figure. With one pair, a concrete slab measured by volume also gets its area
adjusted by the area threshold. A plaster covering measured by area also gets
its volume adjusted.

## What changed

The rule now takes a pair for each work section: walls, slabs and roofs,
coverings and finishes, beams, columns and members, and everything else. A
section you don't set uses the main pair. On the page, the "Openings" control
has a **By work section** preset: walls and finishes by area (0.50 m²),
slabs and frames by volume (0.05 m³). Under **Custom thresholds**, ticking
"per work section" opens a small table to edit. On the command line:

```
node cli.mjs model.ifc --voids-up-to "0.5,0.05;slabs=0,0.05;coverings=0.5,0"
```

The bill-of-quantities CSV heading spells out the rule it was measured under.
The preset is shaped like UK practice, but it isn't any standard's text. You
still type the numbers your contract's method gives.

## How much it moves on real models

We ran the single 0.50 m² / 0.05 m³ pair and the by-section preset over 11
public models. On 7 the bills were identical. On the other 4, the single pair
adjusted figures that a per-section rule leaves alone:

| Model | What the single pair also moved |
|---|---|
| HHS Office, architect (Revit) | slab area +7.21 m², from 102 small slab openings |
| kleine_Wohnung | slab area +2.93 m² |
| ARK_NUS school | slab area −2.21 m² (a gross figure with its larger openings taken out) |
| schependomlaan | covering volume +0.04 m³ |

Slab volumes and wall figures came out the same under both. The amounts are
small, under 0.2% of any class's total, because these models have few small
openings. But they land on lines an estimator prices by area, like a slab's
soffit formwork or its finish. On a services-heavy building with hundreds of
floor penetrations, the gap grows with the count.

Method, models and numbers are in
[eval/measure-sections-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/measure-sections-2026-11-20.md).
Nobody has checked the result against a quantity surveyor's measured bill of
one of these models yet. That's the outside check still missing.

The tool runs in your browser and nothing is uploaded. It isn't a measured
survey or a cost estimate. Check every quantity against the drawings and your
method of measurement.
