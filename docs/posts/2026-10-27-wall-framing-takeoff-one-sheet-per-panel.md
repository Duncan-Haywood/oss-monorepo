---
title: "Wall framing takeoff now prints one sheet per shop panel"
date: 2026-10-27
description: "Shop drawings can add a page for each transportable wall panel: cropped elevation, weight and its own cut list, from the CLI or the page."
tags: [wall-framing-takeoff, construction, prefab]
---

A panel shop builds panels, not whole walls, so a wall sheet with purple cut lines still leaves someone to work out what belongs to panel B. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now has `--panel-max=12ft --panel-sheets` (and a checkbox on the page) that adds one printable sheet per panel after each wall's sheet: the elevation cropped to that panel's span, its piece count and weight, and the cut list for just those members, with plates already cut to panel length.

On the example house the 8 wall sheets become 31 sheets at a 12 ft limit. I checked one panel by eye in headless Chromium and fixed two faults that way (the whole-wall label showing clipped, and a sliver of the neighbouring panel at the edges). Tests count the sheets; nothing has been checked on a real builder's plan,. Weights are handling estimates, not a lifting plan, and none of this is engineering advice.
