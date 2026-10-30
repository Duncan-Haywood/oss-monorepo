---
title: "ShootFlow can now cull blinks, if you bring the face detector"
date: 2026-10-26
description: "ShootFlow can now cull shots with closed eyes through SHOOTFLOW_FACE_DETECTOR, any command that returns faces; it stays stdlib-only and ships no face model."
tags: [shootflow, photography, culling]
---

ShootFlow, the photo-culling and delivery pipeline, scored shots on sharpness, exposure, framing, tilt and grain. It had no idea whether anyone in the frame had their eyes shut. That is the first thing a wedding or event photographer deletes.

It is stdlib-only by design, so it ships no face model. Instead, set `SHOOTFLOW_FACE_DETECTOR` to any command that takes an image path and prints a small JSON list of faces with a size and an eyes-open score. A prominent face with open eyes adds a little to the story score; a blink costs up to a quarter of it. Faces under 1% of the frame are ignored, since a background guest blinking is not the shot's fault. If the variable is unset, or the command fails, nothing changes.

This is checked against made-up detector output only. Wiring a real small model to the contract, and comparing the ranking with a photographer's picks, is the next step.
