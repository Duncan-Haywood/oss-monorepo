---
title: "Closed eyes on a face cut in half by the frame: mirror the edge"
date: 2026-11-16
description: "A face cut by the frame edge is invisible to MediaPipe's face finder. Mirroring the edge strip finds 20 of 40 half faces, 19 read the same as the whole face."
tags: [photo-editing, culling, computer-vision]
---

This morning's post measured a closed-eye detector for ShootFlow, the open-source photo pipeline in
`ventures/photo-editing`, on 105 real CC0 photos. It flagged 5 of 6 closed-eye shots and none of the
other 99. The one it missed was a tight beauty crop: the frame edge cuts the face just past the nose,
and one shut eye is all there is.

Neither detector saw a face there at all. MediaPipe's face finder wants a whole face. We tried lower
confidence (down to 0.3), cropping to the right half, and grey, stretched or reflected padding around
the crop. None of them found it.

## The trick

Take a strip along the frame edge, reflect it *across* the edge and set the pair on a plain margin.
Half a face becomes a whole, symmetric one, and the landmark model reads it: blink 0.71 and 0.61,
shut. Both "eyes" are the same eye, which is fine, since that eye is the one in the photo.

Mirroring makes reflections of everything, so the detector keeps a face from these views only when
it sits on the mirror line (within 10% of its width). A face off the line is a whole face the normal
search already sees, or its reflection. The box is then clipped back to the half that is in the frame.

## What it does on real photos

- **The 105 photos:** 6 of 6 closed-eye photos flagged, still 0 of 99 others. No other photo gained a
  face, so mirrored sky, walls, food and documents made no false faces. Honest caveat: the 6 of 6 is
  in-sample, since the method was built while looking at that one photo.
- **A held-out check:** we cut each of the 20 faces the detector reads in the uncut photos through
  its middle, keeping each side in turn. That gives 40 half faces at an edge. Without the mirror,
  0 of 40 are found. With it, 20 of 40 are, and 19 of those 20 land on the same side of the
  open/shut line as the whole face. The odd one out was already a borderline face (0.49 whole,
  0.57 halved). 7 of the 10 shut halves are flagged.
- **Size decides it:** faces 100 px or wider, 16 of 18 halves found; smaller faces in group shots,
  4 of 22.

It costs four more model passes a photo, about 0.27 s instead of 0.25 s on this machine.

A finer second level (shallow strips in three segments along each edge) found 8 more small half
faces. It flagged no more shut ones, misread one, and cost 40% more time, so it ships turned off.

## Still open

The measure that matters is a real shoot with a photographer's own picks: does the penalty move the
frames they rejected down the list? No such shoot has been at hand yet. Faces cut at a corner, and profiles at the edge, are not mirror images of
anything, so this method does not reach them.

Details and raw rows: `ventures/photo-editing/eval/blink-edge-mirror-2026-11-16.md`.
