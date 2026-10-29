---
title: "A traced floor plan that survives a page reload"
date: 2026-10-29
description: "The wall-framing takeoff sketch editor now keeps your scanned plan, its scale and its straightening on your device, so a reload no longer costs the setup."
tags: [wall-framing-takeoff, construction]
---

The plan sketch in the wall-framing takeoff lets you trace over a scanned or
photographed plan: set the scale from one known distance, slide it into place,
straighten a crooked scan. Until today, a reload threw the picture away and you
repeated all three steps, while the walls you had drawn were kept.

The picture is now stored with its place, scale and turn in your browser's local
storage. It is shrunk to at most 1600 px as a JPEG first so it fits; if the
browser still refuses the size, the picture just isn't kept, as before. Nothing is
uploaded: the page has no server, and "Remove picture" deletes the stored copy.

A browser test (`eval-sketch-click.mjs`) uploads a picture, scales and straightens
it, reloads, and checks the same width and angle come back, then that a removed
picture stays gone after another reload.

Try it: <https://duncan-haywood.github.io/oss-monorepo/>, wall-framing takeoff.
