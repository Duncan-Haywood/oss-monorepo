---
title: "Why the homepage ran at seven frames a second"
seo_title: "Fixing homepage lag: blur filters, canvas cost and a frame check"
date: 2026-11-03
tags: [performance, web, css, canvas, open-source]
description: "The homepage fell to 7 fps on a slow laptop. A blur filter over moving shapes and a heavy canvas were why; a new browser check now catches it."
---

The owner reported "tons of lag on the site". The server was not the problem: the homepage's first byte arrived in 0.45 s and the whole page in about half a second. The problem was what the browser had to draw every frame after the page loaded.

I measured it in headless Chromium with the CPU throttled 4x, which is roughly an ordinary laptop on battery. The homepage drew **7 frames a second while idle, with a 383 ms p95 gap between frames**. Every tool page drew 60.

Then I turned off each decoration in turn and measured again:

| Hero with… | idle fps |
| --- | --- |
| everything on (as shipped) | 5–7 |
| no aurora | 15 |
| no canvas | 8 |
| no aurora and no canvas | 57 |

Two things accounted for nearly all of it:

- **The aurora**: three circles up to 720 px wide, each blended with `mix-blend-mode: screen` and moving, inside a container with `filter: blur(70px)`. A blur filter over moving content means the browser re-renders and re-blurs the whole area on every frame. The circles are now `radial-gradient`s that fade out on their own. They look the same and move on the compositor at no paint cost.
- **The constellation canvas**: up to 110 points, drawn at twice the screen resolution, with one `stroke()` per connecting line (about 6,000 per frame) and a `shadowBlur` glow on every dot. Lines are now batched into four paths by strength, the glow is a faint wider disc instead of a shadow, the canvas is drawn at CSS pixels and redraws about 30 times a second. Resolution was the largest part: at 1x the remaining cost fell from 24 fps to 52.

Smaller changes in the same pass: no `backdrop-filter` on the hero stats or the research cards (their backgrounds were already near-opaque), no animated sheen on the headline text, and the card pointer light now updates at most once per frame.

After: **52 fps idle and 48 fps while scrolling on the throttled laptop profile, 50 and 46 on the phone profile** (from 7/44 and 12/42). In a screenshot the hero looks about the same.

## So it doesn't come back

No existing check could have caught this. Every check on this site reads files or takes one still frame, and a still frame of a janky page looks the same as a smooth one. There are two new checks:

- `platform/pages/framerate.mjs` loads the homepage, the research and writing indexes and the showcased tools at laptop and phone sizes with the CPU throttled, and fails any page under 30 fps or over a 70 ms p95 frame. Against production today it fails the homepage and passes everything else.
- A unit test in `showcase.test.mjs` fails if the hero's CSS or script brings back a blur filter, `backdrop-filter`, a blend mode, an animated `background-position` or a canvas `shadowBlur`. It fails on the old code and passes on the new.

Headless Chromium draws in software, so its numbers are lower than a real GPU's. Treat them as before-and-after comparisons, not as what your laptop will show.
