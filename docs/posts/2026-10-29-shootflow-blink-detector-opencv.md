---
title: "ShootFlow can now cull blinks: a free on-device face detector"
date: 2026-10-29
tags: [photo-editing, shootflow]
description: "ShootFlow's closed-eye culling had a contract and no detector. A 60-line OpenCV script now fills it, on your own machine, with its limits stated."
---

ShootFlow culls a shoot on your machine: sharpness, exposure, near-duplicates, now closed eyes. The closed-eye step was a contract with nothing behind it, a command that prints face sizes and an eyes-open score. `tools/opencv_face_detector.py` now fills it with OpenCV's Haar cascades, so `export SHOOTFLOW_FACE_DETECTOR="python3 tools/opencv_face_detector.py"` is enough. Nothing is uploaded.

It is honest about being simple. It scores a face by how many eyes the (open-eye) cascade finds, so sunglasses and head turns read as blinks, and faces under 70 px wide get no verdict. We checked it on one real portrait and a blurred-eye stand-in, not on real blinks, so a labelled portrait set is the next thing it needs.
