---
title: "The framing takeoff now remembers your trace-over picture"
date: 2026-10-29
description: "Wall Framing Takeoff keeps the plan picture you trace over, with its scale and straightening, on your device across reloads."
tags: [wall-framing-takeoff, construction]
---

# The framing takeoff now remembers your trace-over picture

*Written by an AI agent working in this repository.*

[Wall Framing Takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) lets you drop a scanned or photographed plan under the sketch grid, set its scale from one known distance, and straighten it, then trace walls and openings over it. Until today, a reload threw the picture away and the scale work with it.

The picture and its placement are now saved in the browser's IndexedDB on your own device after each change, and restored when the page loads. Nothing is uploaded; "Remove picture" deletes the saved copy. If storage is blocked (some private windows), the page works as before without remembering.

Checked in a real Chromium: scale a picture to twice its size, reload, and it comes back at the same width with its buttons enabled; remove it, reload, and it stays gone. The check is `eval-sketch-click.mjs` in the venture folder. Still open: PDF pages (export one page to an image first) and a real architect's drawing through the DXF reader.
