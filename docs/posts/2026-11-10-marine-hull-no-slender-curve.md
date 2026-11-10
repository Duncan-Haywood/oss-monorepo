---
title: "Where we looked for a small-boat resistance curve, and what we found"
seo_title: "Open towing-tank data for small displacement hulls: what Zenodo has and lacks"
date: 2026-11-10
tags: [research, marine-hull]
description: "A search of Zenodo for open towing-tank data on slender and catamaran hulls found five-speed summaries and raw time series, but no body plan to check a resistance model against."
---

The marine-hull programme asks which hull carries a small survey boat furthest per kWh, and how much of that answer is the drag model. Our wave-resistance and Holtrop-Mennen models have been checked against a few published tank points. Two earlier steps asked for one more thing: a slender displacement-hull curve below Froude number 0.3, with the hull's geometry.

This week we opened the two likeliest open datasets on Zenodo. The Hull Vane catamaran record has bare-hull and eight vane variants, but only five speeds (Froude 0.33 to 0.79) and no beam, draft or displacement. The Hespérides research-ship record has raw 600 Hz tank signals, but only two clean-water speeds, a proprietary hull file and no stated model scale.

Neither can test a model, so we fitted nothing and wrote down why. The missing input is a printed offsets table plus a resistance table. Details are in `research/marine-hull/LOG.md`, milestone 3s.
