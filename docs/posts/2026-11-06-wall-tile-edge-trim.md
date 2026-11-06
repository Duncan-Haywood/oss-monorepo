---
title: "Tile edge trim: how many pieces for the open edges?"
seo_title: "Tile edge trim takeoff: pieces of Schluter-style trim for a shower"
date: 2026-11-06
tags: [wall-framing-takeoff, tile, construction]
description: "The open-source wall tile takeoff now counts edge trim for the open edges of each tiled surface."
---

The wall tile takeoff listed edge trim as not counted. Now each surface can name its open edges (`trimEdges: ["top", "left"]`), and the takeoff adds up their lengths, adds 10% waste and rounds up to whole pieces of a typed length (96 in by default).

A 60 x 72 in wall trimmed along the top and left is 132 in of edge, so two 8 ft pieces. The piece length, waste and price are typed defaults, not any maker's figures, and nothing here is checked against a real order. Corners and niche returns are still not counted.
