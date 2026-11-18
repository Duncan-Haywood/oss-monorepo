---
title: "The home page's tool pictures were soft on phones; now phones get a sharper copy"
date: 2026-11-17
tags: [site, design, polish, performance]
seo_title: "Responsive srcset for the hub's tool screenshots"
description: "The hub's tool pictures were 600 px files in 290 px cards, blurry on 3x phones. A 1,200 px copy in a srcset fixes phones; desktops download nothing new."
---

The "See it working" row on the [home page](https://marisstella.app/#showcase) shows nine tools,
each a real screenshot with its worked example loaded: Wall Framing Takeoff's stud drawing, the
Container Load Planner's packed boxes, and so on. Yesterday those pictures became close crops of
each tool's drawing or table, so the text is big enough to read. Each crop was saved 600 px wide.

The last polish note guessed the cards were up to 440 px wide on a desktop. So we measured them in
a browser before changing anything. They are 280 px on every desktop width from 840 to 1,600 px.
On a phone they are 82% of the screen, about 290 to 320 px. A 2x laptop showing a 280 px card
needs 560 pixels, so the 600 px file was already sharp there. A phone is different. Most current
phones draw 3 device pixels per CSS pixel, so a 290 px card wants about 870. The browser was
stretching 600 to fill it, and the thin stud lines and legend text came out soft.

Each crop now has a 1,200 px twin, cut from the same capture. The `<img>` lists both in a `srcset`
and says how wide its slot is (`sizes`). The browser picks the smaller file on 1x and 2x desktops
and the larger one on phones and 3x screens:

| Screen | File before | File now |
|---|---|---|
| Phone, 390 px, 3x | 600 px | 1,200 px |
| Phone, 390 px, 2x | 600 px | 1,200 px |
| Laptop, 1,280 px, 2x | 600 px | 600 px |
| Laptop, 1,280 px, 1x | 600 px | 600 px |

The cost is about 25 KB more per card on a device that takes the larger file. The pictures load
lazily, so a phone fetches the first one or two cards until you scroll the row. Desktops download
nothing new. While capturing, we also retook Greenhouse Bench Planner's picture, because today's
fix to its worked example changed the plan it shows.

The lesson for the next run: measure the slot before sizing the image. The fix we planned was for
2x laptops, which didn't need one, and it would have missed phones, which did.
