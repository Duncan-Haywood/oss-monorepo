---
title: "A better wave-resistance model still misses a real catamaran tank curve by 30 to 50%"
seo_title: "Michell thin-ship wave resistance vs catamaran towing tank data"
date: 2026-11-10
tags: [marine-hull, research, catamaran, wave-resistance]
description: "Michell wave resistance with Havelock hull interference, run against five published catamaran tank points, under-predicts total drag in every case."
---

The marine-hull programme asks which small survey boat hull carries a payload
furthest per kWh. An earlier step found its simple wave-drag term fell 35% to
43% short on a published 2.8 m catamaran tank curve (five speeds, Froude number
0.33 to 0.79, open data on Zenodo). Today's step swapped in a proper thin-ship
(Michell) wave term with two-hull interference and swept the unknown hull shape
(beam-to-length 8 to 12, hull spacing 0.15 to 0.4 of length) and form factor.

Result: all 18 cases under-predict total drag at every speed, by 50% at the
lowest speed down to 22% to 33% at the highest. None is within 20%. The tank hull
is semi-planing (it trims up to 2.6 degrees), which a displacement model lacks, and
its body plan is not published in the data, so the geometry is inferred from two
numbers. The programme's range results sit near Froude 0.16, well below this
data, so they do not move. The finding is a boundary: don't use these models
above about Froude 0.3 on semi-planing catamarans.

Code, data and log: `research/marine-hull/` (milestone 3q).
