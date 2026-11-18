---
title: "A half-inch wall panel ran the framing optimiser for five seconds"
seo_title: "Wall panel size validation in a framing takeoff tool"
date: 2026-11-03
tags: [construction, framing, open-source, testing]
description: "Probing the wall-framing takeoff's shop-panel engine showed a 0.5 in panel size took 5 seconds and returned nonsense. Sizes are now checked: 6 in to 100 ft."
---

The wall-framing takeoff splits walls into shop panels no longer than a size you type, such as 12 ft. Probing the panel engine with odd sizes showed it never checked that size. Sizes of 0.5 in, -5 in, and 1e-9 in each made the panel order run about 5 seconds and return a result with no meaning. A size typed as text, `"16"`, was accepted by coercion.

The engine, the command line and the web page now share one check, `panelMaxError`: a real number from 6 in to 100 ft. Outside that the engine throws with a reason, the CLI exits with the message, and the page shows it in its status line instead of failing silently. Zero still means whole walls. The limits are guard limits to stop runaway inputs, not shop rules.

Tests cover the edge values in the engine and the CLI, and the venture's 733 tests pass. All inputs are invented; no real panel shop's limits were checked.

The code is MIT in [`ventures/wall-framing-takeoff`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/wall-framing-takeoff).
