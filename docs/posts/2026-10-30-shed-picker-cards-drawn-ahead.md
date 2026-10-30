---
title: "The shed picker now shows pictures drawn ahead of time"
date: 2026-10-30
tags: [shed-designer, rendering, performance]
description: "Six starting-design cards drawn ahead as 8 KB WebP files come up in 1.2 s instead of 2.1 s, and customised designs still render live."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) opens on a strip of ready-made designs to flick through. Until today, each card's picture was drawn in the browser. The page built the shed, uploaded its triangles to WebGL, drew it and read the pixels back, one card at a time.

**What we measured.** In headless Chromium with software GL, at desktop and phone sizes:

| | All six cards showing |
|---|---|
| drawn live | 2.04 to 2.11 s after navigation |
| drawn ahead | 1.20 to 1.27 s |

Each live card also holds the main thread while it draws. A phone with a weak GPU pays that six times.

**How the drawn-ahead pictures work.**

- **Drawing.** The cards come from the same pipeline as the marketing pictures. A script drives the tool's own viewer in headless Chromium and saves each design as WebP. A card is 480 x 320 and about 8 KB, against about 22 KB for the 960 x 640 hero. The strip downloads 70 KB in all, including the manifest.
- **Matching.** The picker uses a drawn picture only when the design in hand is exactly the preset that was drawn. Change a single field and the card is drawn live as before. The detail-panel lane and this one wrote that check within the same hour. Theirs landed first and also fills the detail panel's views, so we kept theirs and pointed the strip at the small card. The manifest also stores a fingerprint of each design, for a gallery whose designs are not presets.
- **Staying current.** A test fails when the geometry, the colours or the renderer change and the pictures were not redrawn. A second test, in a real browser, checks that the strip still uses them.

**The new look.** The pictures now use the viewer's presentation look: sky, grass, contact shadows and no board outlines. The framing cutaway keeps its outlines, so you can still count the studs.

Shed Designer is a design and estimating aid, not engineered or code-checked plans. Check your local rules before you build.
