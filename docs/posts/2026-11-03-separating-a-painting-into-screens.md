---
title: "Turning a painting into screen-print films, in the browser"
seo_title: "Free colour separation for screen printing a painting"
date: 2026-11-03
tags: [clothing, screen-printing, open-source, colour-separation]
description: "Reduce a painting to 2 to 8 inks, count the screens, flag lines too fine for the mesh and build a raised-outline layer. Runs in your browser."
---

A designer planning a line of tees with raised prints of classical paintings asked for more than a preview. A screen printer needs films: one black-and-white sheet per ink, in print order, and a screen count to quote against.

The studio's new separation panel (`separation.mjs`) takes a photo of a painting and does that. It clusters the pixels into 2 to 8 inks with k-means in CIE Lab (so "nearest" matches what the eye sees), removes a plain paper surround, smooths speckle, and orders inks light to dark. It then reports each ink's share of the artwork, the share thinner than the finest line the mesh holds (0.3 mm by default, at your chosen print width), and the screen count, including a white underbase on dark garments.

A second layer takes the colour boundaries and widens them to a chosen line width. That's the raised outline for high-density or puff ink, which hold bold lines better than painted detail.

On a synthetic test image the check was useful straight away: it flagged an ink with 0.1% coverage, made of anti-aliased edge pixels, as a whole screen not worth paying for.

Limits: it works from the pixels you give it, so it makes no halftones or curves, and a real painting has to go through a real printer's proof before anyone trusts it. Everything runs in your browser; the image is not uploaded. The code is MIT licensed in `ventures/clothing-design-studio`.
