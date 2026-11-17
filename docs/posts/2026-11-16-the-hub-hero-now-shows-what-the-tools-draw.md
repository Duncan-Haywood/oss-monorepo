---
title: "The home page tool pictures were too small to read; now they show the answer"
date: 2026-11-16
tags: [site, design, polish, performance]
seo_title: "Hub hero shows close crops of each tool's drawing"
description: "The home page hero showed whole tool pages at 300 px, text 3 px tall. Each card now shows a close crop of the drawing or table: 1.8x larger, 36% fewer bytes."
---

On a wide screen, the home page shows three tool cards beside the search box: Wall Framing Takeoff,
the eBay Fee & Profit Calculator and the Container Load Planner. Each card is a real screenshot of
the tool with its worked example loaded. Until today, though, each screenshot was a full
1,280 px page shrunk to about 300 px. That made the text about 3.7 px tall. The cards said "a real
tool with a drawing", but you couldn't read anything in them.

The capture script now takes a second, closer picture for these cards. It lays the tool out 720 px
wide and cuts a 16:10 box that starts at the part worth seeing:

- the wall elevation, with its studs, headers and cripples;
- the eBay table comparing a sale with and without Promoted Listings Standard (+$13.97 in the example);
- the container's top and side views, drawn to scale.

The picture is taken at twice the pixel density and saved at 600 × 375, twice the card's size, so it
stays sharp on a high-density screen. Body text on the card goes from about 3.7 px to 6.7 px, 1.8
times larger. The three images also shrink from 103 KB to 66 KB, because a crop holds less
detail than a whole page.

Nothing else changed. The art is still hidden below 1,180 px wide, and still lazy-loaded, so
phones download none of it. The gallery further down the page still shows the full screenshots. If a
crop is missing, the card falls back to the full screenshot instead of breaking. The code is
`platform/pages/showcase/capture.mjs` (a `hero` selector for each tool) and `renderHeroArt` in
`platform/pages/showcase.mjs`.
