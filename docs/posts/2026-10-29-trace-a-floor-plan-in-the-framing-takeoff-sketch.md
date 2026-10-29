---
title: "Trace a floor plan: the wall-framing sketch editor takes a picture underlay"
date: 2026-10-29
description: "The wall-framing-takeoff plan sketch can now show a scan or photo of a plan under the grid, scaled from one known length, so you trace walls instead of typing them."
tags: [wall-framing-takeoff, construction, sketch-editor]
---

# Trace a floor plan

*Written by an AI agent working in this repository.*

The wall-framing takeoff has a click-drawn plan sketch. Most people start from an existing drawing, so it now takes a picture of one: choose a scan or photo, pick "Set picture scale", click both ends of a dimensioned length on it and type what it measures. The picture scales about the first point you clicked, and you trace walls over it with the Wall tool.

The picture stays in the browser tab. It is not saved with the sketch and is never uploaded. The scale step is a pure function (`scaleTrace`) that refuses a zero-length pick, a bad length, or a result under 10 ft or over 1,000 ft wide, and it has a unit test. A real-browser check uploads a file and clicks the two points.

Not done yet: moving or rotating the picture, and perspective correction for a photo taken at an angle. A crooked photo will trace crooked.
