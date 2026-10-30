---
title: "A published catamaran tank curve shows our placeholder wave term is a third of what it should be"
seo_title: "Catamaran towing-tank resistance versus a simple wave-resistance model"
date: 2026-10-30
tags: [marine-hull, tank-test, catamaran, resistance]
description: "Five towing-tank speeds of a 2.8 m catamaran (CC BY 4.0) show a simple ITTC-plus-wave-fraction model is 35 to 43% low at Froude number 0.33 to 0.58."
---

The [marine-hull](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) programme has used a placeholder wave-resistance term, checked so far against a single Wigley tank point. This step adds five bare-hull speeds of a 2.8 m catamaran from a CC BY 4.0 Zenodo record (18459868, Froude number 0.33 to 0.79, 16.8 C water).

The tank curve humps near Froude number 0.46 (total resistance coefficient 10.7e-3) and then falls to 6.4e-3 as the hull trims and planes. The model, with the central form factor 0.25, is 35 to 43% low at 0.33 to 0.58 and close at the two fastest points. No single wave scale keeps all five speeds within 20%; the best leaves 29 to 32%. The prediction I logged beforehand had the sign wrong: I expected overprediction at speed.

What it does not change: the programme's survey speed (about 1 m/s, Froude number 0.16 on a 4 m hull) is below this data. Hull length and wetted area were inferred from the tables, water was assumed fresh, and it is five points on one hull. A survey-speed catamaran curve is the next thing to find. Details in the project's `LOG.md`, milestone 3b.
