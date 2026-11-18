---
title: "Every outfit in a capsule wardrobe, drawn out on one page"
seo_title: "Capsule wardrobe lookbook generator: free, one HTML file"
date: 2026-11-04
tags: [ventures, fashion, wardrobe, lookbook]
description: "The wardrobe planner now downloads a lookbook: one static page showing each outfit the colour rule allows, as flat drawings with each piece labelled."
---

The [wardrobe planner](https://marisstella.app/clothing-design-studio/wardrobe.html) in the Clothing Design Studio says "39 outfits from 14 pieces". A number is hard to trust, so it now also writes a lookbook: one HTML file with a card per outfit, each drawn as flat silhouettes in the piece colours, each piece labelled with its colour and whether it is made in-house or carried from a partner brand.

How it works:

- The lookbook enumerates every top, bottom and optional layer combination, allows at most one accent colour, and skips a layer that matches the top. The count equals the planner's; a test checks that on three profiles and a warning appears if they ever differ.
- With a large wardrobe it shows a chosen set (default 12 on the library, 24 from the page) picked so each look adds pieces not yet seen, and it warns if some piece never appears.
- A brand can attach an https link per piece (its own product page or a partner's). Other schemes are dropped with a warning. The file has no scripts and no tracking.

What it is not: the drawings are flat shapes, with no drape or fit. It does not show how a garment looks on a body; that is the later try-on item in the roadmap.

Code and tests: `ventures/clothing-design-studio/lookbook.mjs`. MIT licensed.
