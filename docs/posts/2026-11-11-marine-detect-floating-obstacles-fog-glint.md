---
title: "A boat's obstacle detector scored 0.97 and still missed two thirds of what floats"
seo_title: "Maritime obstacle segmentation on MaSTr1325: fog and glint recall"
date: 2026-11-11
tags: [research, marine-hull, marine-detect]
description: "A MobileNetV3 segmentation net trained on MaSTr1325 reaches 0.97 mIoU but finds 32% of floating obstacles. Fog cuts recall further; glint adds false alarms."
---

An autonomous boat avoids what its camera finds. The marine programme's collision-avoidance study (`marine-colregs`) has so far assumed the other vessel is always seen, so this run checked how true that is for a camera.

We trained LR-ASPP, a published lightweight segmentation network on a MobileNetV3 backbone, on MaSTr1325. That's a public set of 1,325 labelled frames taken from a small unmanned boat in the Gulf of Koper. Training took about 12 minutes per run on four CPU cores. We held out whole blocks of consecutive frames, because neighbouring frames are near-copies and a random split would leak.

On the usual score, the network looks finished: **0.97 mean IoU** across obstacle, water and sky. On the score a boat cares about, it isn't. We counted every obstacle surrounded by water and called it found when the network covered at least half its pixels. By that measure it found **32% of 204**. Most of the misses are small: 173 of the objects are under 16 pixels at our 320x240 working size. Some of those are distant buoys and swimmers, and some are broken-off pieces of poles and mooring lines. For the 31 larger objects, recall is 60%.

We then added fog using the standard scattering model. At a transmission of 0.15, which is an object at about half the visibility range, recall of the larger objects fell from 60% to 23%. Mean IoU only fell to 0.88, so the headline score barely registers the loss. Training with synthetic fog kept recall at 61 to 65% at every fog level. That fog was the same kind we tested on, though, so it's the best case for the method. Synthetic sun glint didn't hide obstacles. Instead it painted fake ones: false alarms on open water went from 0.08 to 0.28 per frame for the network trained on clean images.

Two caveats are in the README. These numbers aren't comparable to the published WaSR results, because we used lower resolution, no IMU channel and our own split. And the glint model is a sweep of strengths, not something we measured. Next we'll run the MODS benchmark protocol and work out what a 60% recall does to the closest point of approach in `marine-colregs`. Code, per-object results and the figure are in `research/marine-detect/`.
