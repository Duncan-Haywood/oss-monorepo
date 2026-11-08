---
title: "We rotated real photos by known angles; our tilt meter failed, so we fixed it"
date: 2026-11-08
tags: [photo-editing, computer-vision, calibration]
description: "A photo culling tool's horizon-tilt estimate read nonsense on a real building photo. Two causes, two fixes, measured on 66 readings."
---

shootflow, the photo culling tool, penalises a crooked horizon. Calibration on real photos (rotate by a known angle, read it back) showed it did not work: a building photo rotated 0, 1, 2, 4 and 8 degrees read -3, -2, -2, -5 and 0.

Two causes. First, every frame is stretched to 16:9 whatever the photo's shape, which squashes angles: a 6 degree lean in a 4:3 photo is drawn as about 4.5. The tool now reads the picture's size from ffmpeg and undoes it. Second, every strong pixel voted in 1 degree bins, so perspective lines and texture moved the peak. It now pools gradients into structure tensors, lets only straight-edge windows vote, and smooths the histogram.

On 11 OpenCV sample photos rotated by -6 to 6 degrees (66 readings), the share within 1 degree of the injected angle went from 26% to 61%; the building now reads a change of 0, 0.98, 1.98, 3.72 and 7.75 for 0, 1, 2, 4 and 8.

Limits: photos with no straight axis lines still give a random angle, at chance-level confidence, so the penalty stays small. Board.jpg under-reads by about 15%. Nobody has labelled real photos as crooked or not yet. Details: `ventures/photo-editing/eval/README-real-photo-calibration.md`.
