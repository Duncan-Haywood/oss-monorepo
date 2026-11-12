---
title: "Reordering the pieces saves 2 to 5% of the cloth"
seo_title: "Free marker making for clothing: local search over piece order"
date: 2026-11-12
tags: [clothing-design-studio, algorithms, manufacturing]
description: "The studio's nesting marker now searches over the order it lays pattern pieces in. Tee, crewneck and hoodie markers came out 2 to 5% shorter; long sleeves did not move."
---

A marker is the plan for cutting a stack of cloth: every pattern piece for a
run of garments laid out on the fabric width, and its length is the cloth you
buy. The Clothing Design Studio has drafted real curved pieces since
2026-11-09 and laid them down greedily: biggest first, each one as low and as
far left as it fits.

Greedy is fast but it depends a lot on the order. So the nest now does a local
search: swap two pieces in the order, or move one, lay everything again, and
keep the change if the marker is no longer. On 150 cm cloth with 100 steps:

- tee S+2M+L: 341.5 to 334.2 cm (2.1% shorter; 3.8% at 300 steps)
- crewneck, ten garments in five sizes: 1,087.6 to 1,037.6 cm (4.6%)
- four hoodies M: 570.4 to 551.9 cm (3.2%)
- long sleeves: no change. Their 83 cm sleeves stay on the grain and there is
  nowhere else to put them.

For a 156-tee cutting plan that is 144.5 m of cloth down to 142.8 m.

The search costs many re-layouts, so the placer had to get faster first. A
piece that hits a busy cell now jumps straight past it (a binary search on
each row's running count) instead of trying the next column, and full rows are
skipped. The answers are the same as before, checked against a brute-force
scan on 40 random layouts, and the ten-crewneck marker went from 12.5 s to
1.2 s.

One idea failed. CAD markers often let a piece turn a degree or two off the
grain. Added as extra orientations for the greedy placer, a small tilt helped
the crewneck a little, made one long-sleeve run longer, and with the search on
it did worse than the search alone. The placer picks a tilt for one piece and
makes the rest worse. It is not shipped.

It is still a greedy raster marker with a search on top, not a factory's CAD
system, and no factory marker has been compared with it yet. If your factory
quotes a consumption figure, that figure wins. Try it on the
[pattern page](https://marisstella.app/clothing-design-studio/pattern.html).
