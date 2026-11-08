---
title: "Advanced framing saves about a quarter of the lumber on a third house, and our table had drifted"
seo_title: "Advanced framing lumber savings measured on three house plans"
date: 2026-11-06
tags: [wall-framing-takeoff, advanced-framing, construction]
description: "Advanced framing cuts the lumber order 26 to 28% on three house layouts, measured with the open-source wall framing takeoff."
---

We measure advanced framing the same way each time: lay out one house with the standard 16 in wall, then again with each detail, and compare the priced lumber order. Until today one of the two public plans (Open House Plans 2, CC0) could not be measured, because two windows drawn 3 in apart need ganging into one opening, and the 195 in header that makes was longer than the longest 2x10 in the bench's stock.

The bench now retries with 20 and 24 ft boards in every size at the same $1 per foot, applied to every variant so the comparison stays fair. It also prints that it did so. Open House Plans 2 now reads:

| option | example house (invented) | Open House Plans 1 | Open House Plans 2 |
|---|---|---|---|
| 24 in stud spacing | -14.4% | -12.0% | -12.3% |
| two-stud corners + ladder tees | -5.2% | -6.6% | -5.9% |
| single top plate | -8.8% | -8.2% | -8.8% |
| all three, 16 in | -14.1% | -14.9% | -14.9% |
| all three + 24 in | -28.0% | -26.1% | -26.6% |

Re-running the other two columns showed the README table had gone stale as the engine changed (it said -25.5% and -23.9% for the full set; the engine now says -28.0% and -26.1%). It is refreshed, so the figures above are the ones the bench prints.

Limits worth stating: this is lumber only. 24 in spacing and a single top plate each need an engineer's say on the real structure, and a 195 in header and a 3 in mullion between windows are the window maker's and an engineer's call. None of the three houses is a permit set, and no framer's real order has been compared yet.

`node ventures/wall-framing-takeoff/advanced-bench.mjs` reproduces the table.
