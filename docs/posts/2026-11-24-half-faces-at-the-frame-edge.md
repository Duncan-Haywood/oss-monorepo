---
title: "Half a face is still a blink: the browser photo culler now mirrors the frame edges"
seo_title: "Finding closed eyes on half faces at the frame edge"
date: 2026-11-24
tags: [photo-editing, culling, closed-eyes, mediapipe]
description: "Face models skip a face cut by the frame edge. Reflecting each edge first lets the free browser culler flag 8 of 10 shut half faces, with no false flags."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free photo
culler that runs in the browser. One of its opt-in features flags closed eyes with
Google's MediaPipe face model, run on your own computer. Earlier today it flagged 6 of
the 7 closed-eye photos in its labelled set. The one it missed was a tight portrait
whose frame edge cuts the face just past the nose.

The reason is simple: the face finder needs a whole face, and half a face is not one.
It found nothing in that photo at any confidence level.

## The fix: reflect the edge

ShootFlow's command-line detector solved this on 2026-11-16, and the page now does
the same. After the first pass, for each edge of the frame the page:

1. takes a strip 40% of the frame deep along that edge;
2. puts the strip's mirror image on the other side of the edge, so a half face and its
   reflection make a whole, symmetric face, and sets the pair on a plain grey margin;
3. runs the face model on that view, and keeps a face only if it is centred on the
   mirror line. A face off the line is a whole face the first pass already saw, or a
   reflection of one.

The box is cut back to the visible half, and the face's blink score is judged by
the same rule as every other face: the more-closed eye over 0.5.

## What it measured

These numbers come from the real page in headless Chromium, reading its own CSV export:

| | closed photos flagged | others flagged | half faces found | shut halves flagged |
|---|---|---|---|---|
| first pass only | 6 / 7 | 0 / 108 | 0 / 40 | 1 / 10 |
| with the edge pass | **7 / 7** | **0 / 108** | **20 / 40** | **8 / 10** |

The 40 half faces are a held-out check. Each face the detector read in an uncut photo
was cut through its centre, keeping the left part and then the right. No open half
face was flagged (0 of 30). The 7 of 7 should be read with care: the method was
designed on the photo it now finds.

What it still misses: half faces narrower than about 100 pixels. The 40% strip makes
them too small for the face finder, and the command-line version has the same limit.

## The cost

The edge pass costs four more model runs per frame. So it runs after the fast
verdicts are on screen, and it skips any frame already flagged, since more faces
cannot clear a "closed" verdict. On a 525-file test card the first pass took 34 seconds and the edge pass 72 more (about 0.14 s a frame). The first verdicts still arrive at the same moment, and you can keep rating while the edges are checked.

The method, numbers and per-photo rows are in
`ventures/photo-editing/eval/cull-edge-mirror-2026-11-24.md`. Your photos are never
uploaded. Treat the tag as a hint and look at the frame before you reject it.
