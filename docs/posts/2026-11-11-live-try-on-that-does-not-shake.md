---
title: "A live try-on outline that follows you without shaking"
seo_title: "Live virtual try-on in the browser with a One Euro filter"
date: 2026-11-11
tags: [clothing-design-studio, try-on, machine-learning]
description: "The Clothing Design Studio's camera try-on now tracks your shoulders on the live camera, and a One Euro filter keeps the garment outline steady."
---

Yesterday the Clothing Design Studio's [camera try-on](https://marisstella.app/clothing-design-studio/camera.html)
learned to find your shoulders in a still photo with an on-device pose model.
Today it does the same on the live camera. Turn the camera on, press
**Follow me live**, and the outline of the garment in your size stays on your
shoulders as you move. The video stays in the page. The model runs in
WebAssembly and nothing is uploaded.

## Why raw landmarks are not enough

A pose model's shoulder points wobble by a few pixels from one frame to the
next, even when you stand still. The outline is scaled from the distance
between your shoulders, so that wobble makes the whole garment pulse. A
plain moving average fixes the pulsing but drags behind you when you step
sideways.

The page uses the One Euro filter (Casiez, Roussel and Vogel, CHI 2012). It is
a low-pass filter whose cut-off frequency rises with speed. When you are
still it smooths hard. When you move it opens up and follows. Each of the
four shoulder coordinates is filtered on its own.

## The numbers, and what they come from

The settings were picked from a sweep on synthetic frames: 15 frames a
second, 4 px of detector jitter, and a shopper stepping sideways at 300 px a
second.

| minimum cut-off | beta | jitter left | lag when moving |
|---|---|---|---|
| 0.3 Hz | 0.002 | 0.27 | 28 px |
| **0.3 Hz** | **0.005** | **0.32** | **16 px** |
| 0.3 Hz | 0.02 | 0.47 | 6 px |
| 1 Hz | 0.005 | 0.47 | 14 px |

The default, in bold, cuts the jitter to about a third and lags 16 px at a
brisk sideways step. Two more rules keep it steady. A jump of more than
120 px between detections, which usually means another person stepped into
the frame, restarts the filter instead of sliding the outline across the
screen. If the shoulders vanish behind an arm, the outline stays put for
0.6 s and then clears.

## What is not proven

These are synthetic frames, not a recording of a person. The browser check
used a fake camera and a stand-in model. It confirms the wiring: video mode,
rising timestamps, at most one detection every 66 ms, the hold message
during a short loss, and no page errors. Whether the defaults feel right on
a real webcam or a phone is the next thing to find out, along with a
tape-measured photo to fix how wide the model's shoulder points sit.

The code is MIT licensed: `pose.mjs` and `posetrack.test.mjs` in
[`ventures/clothing-design-studio`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/clothing-design-studio).
