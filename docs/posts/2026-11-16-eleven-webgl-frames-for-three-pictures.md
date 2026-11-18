---
title: "Eleven WebGL frames for three pictures: the shed designer's thumbnails drew four times each"
seo_title: "WebGL thumbnails drawn four times: counting frames per toDataURL"
date: 2026-11-16
topic: infrastructure
tags: [performance, webgl, testing, playwright, shed-designer]
description: "The shed designer drew 11 WebGL frames for 3 pictures. Off-page canvases now draw once, at the snapshot: same pixels, a quarter less GPU CPU in tests."
---

The [shed designer](/ventures/shed-designer/) shows a 3D view of your shed, and
it also makes small pictures of other designs: a card in the gallery strip, a
thumbnail of each design you compare. Those pictures come from a second WebGL
canvas that never goes on the page. The viewer draws the shed into it and reads
the pixels back with `toDataURL`.

Its browser tests were the slowest file in the venture, at about 70 s, so we
measured where the CPU went. Half of it was Chromium's GPU process. In the test
browser that process is SwiftShader, which runs WebGL on the CPU, so every frame
costs real time.

Counting frames gave a plain answer. We wrapped `clear()` and counted one frame
for each colour clear. Opening the page drew **11 frames to make 3 pictures**:

- The gallery card's canvas drew four times. `show()` drew, then setting the
  camera angle drew, then `snapshot()` drew before it read back, and then a
  `ResizeObserver` callback drew once more for a canvas that was never resized.
- The compare thumbnail drew three times, for the same reasons.
- The on-page view drew twice: once when the shed was shown, and again when its
  first resize callback fired at the size it already had.

A canvas off the page can only be seen through the snapshot, and every frame
clears and repaints the whole scene. So each frame before the snapshot's was
thrown away.

The change keeps the drawing code exactly as it was. That matters because its
source is hashed to decide whether the stored renders are stale. Only the
callers changed: an off-page canvas now waits for `snapshot()`, and the resize
callback redraws only when the size really changed. Loading the page now takes
5 frames, one per picture plus two read-backs.

To check the pictures, we hashed every image the page produced, both before and
after the change. That covered the load, an edit, and the eight "make options"
cards: 14 images, all byte-identical. All 43 browser tests still pass. Over
alternating runs, the GPU process's CPU time fell from 95 to 100 s to 69 to 77 s,
about a quarter. The file's wall time fell about 7%, from a mean of 72.8 s to
67.8 s, though that number is noisy because the renderers fill the rest of the
machine.

The saving also reaches anyone who opens the page: the first visit asks their
GPU for 5 frames instead of 11. That is a small cost on a laptop, but not on a
cheap phone.

The reading, the frame table and what we left alone are in
[the perf note](../history/ci-perf-2026-11-16-shed-viewer-one-frame-per-picture.md).
