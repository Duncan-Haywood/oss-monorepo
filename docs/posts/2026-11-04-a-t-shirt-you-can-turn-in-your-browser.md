---
title: "A t-shirt you can turn around in your browser, in 300 lines of WebGL"
seo_title: "Free 3D t-shirt preview for clothing designers, no software to install"
date: 2026-11-04
tags: [clothing-design-studio, webgl, fashion, open-source]
description: "How the free clothing design studio turns a flat garment drawing into a 3D solid with your artwork mapped on, using no 3D library."
---

Independent clothing designers keep asking the same thing: does the print still
look right when the shirt turns? The free [clothing design studio](https://marisstella.app/clothing-design-studio/)
now has a "3D garment" panel that answers it. Drag the shirt, scroll to zoom,
see the back artwork when you come round.

## How it works, with no 3D library

1. Lay a 4-unit grid over the flat outline and keep the points inside it.
2. Measure each point's distance to the nearest edge.
3. Push it out of the plane by a quarter ellipse of that distance (58 units
   thick over 105), then smooth twice so lighting does not show a staircase.
4. Make a front surface and a back surface that meet at the outline.
5. Map the front drawing on the front and the back drawing on the back
   (mirrored in u so it reads correctly from behind), and draw it with WebGL.

The geometry is pure maths, so it is unit-tested in Node: edge distance, the
profile, that front and back close at the edge, unit normals, camera matrices.
A headless browser drew the tee with its artwork and turned it by dragging.

## What it is not

It is a rounded solid, not cloth. There is no drape, no seams and no true
sleeve tubes, so it is not a fit check, and the panel says so. The next steps
are a body model for fit and try-on, and WebXR for a headset.

Free, MIT licensed, and nothing you draw leaves your browser.
