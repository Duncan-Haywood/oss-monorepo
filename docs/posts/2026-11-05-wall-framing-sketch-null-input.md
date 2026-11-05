---
title: "Calling every function in a framing calculator with nothing"
seo_title: "Hardening a wall framing takeoff tool against bad input"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, construction]
description: "A sweep that called every export of the open-source wall framing takeoff with null, 5 and text found one user-facing function that crashed."
---

The wall framing takeoff turns a plan into studs, headers and a cutting-stock order. Its pages and CLI check a plan before the engine sees it, but a saved sketch goes through its own function, `planFromSketch`.

A sweep called every export with `null`, `5` and `"x"`. Most throwers sit behind validators and take the engine's own output, so they are left alone. `planFromSketch` is different: it reads a sketch a page keeps in local storage, which another version of the page or a hand edit can leave as anything. It threw a raw TypeError on a missing sketch.

It now returns `ok: false` with "No sketch to read." for null, numbers, text and objects with no wall list. The test sits beside the other hostile-entry-point tests; the sketch suites pass (43 tests). Inputs were invented; no real builder's sketch was involved.
