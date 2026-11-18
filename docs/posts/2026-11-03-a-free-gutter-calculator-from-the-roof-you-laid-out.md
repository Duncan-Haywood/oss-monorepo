---
title: A free gutter calculator that starts from the roof's eaves
date: 2026-11-03
description: A new browser page counts gutter sections, downspouts, hangers and fittings for a gable or hip roof from the same engine as the framing CLI.
tags: [wall-framing, gutters, calculators, construction]
---
Gutters hang on eaves, not rakes, so a gable roof needs two runs and a hip roof four. The new [gutter calculator](../../ventures/wall-framing-takeoff/gutter-calculator.html) lays out the roof first, takes the eave runs from it, packs them into your section length and counts downspouts, hangers, end caps, elbows, straps and hip corners.

For a 24 x 40 ft gable house with 12 in overhangs it gives 84 ft of gutter (two 42 ft runs), 10 ten-foot sections at 10% waste, 4 downspouts, 44 hangers at 24 in, 8 elbows and 8 straps. `page.test.mjs` pins those figures to the engine. The same house as a hip roof gives 136 ft in four runs, 6 downspouts and 4 mitred corners.

Downspout counts are two rules of thumb (one per 40 ft of run, one per 600 sq ft of roof plan area), not a drainage design; local rainfall and the manufacturer's tables decide the real number. The page runs in the browser and sends nothing. Checked against the engine only; no real gutter order has been compared yet.
