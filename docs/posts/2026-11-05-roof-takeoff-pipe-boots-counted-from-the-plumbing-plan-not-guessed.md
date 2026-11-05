---
title: "Roof takeoff: pipe boots counted from your plumbing plan, never guessed"
seo_title: "Pipe boot count in a roof material takeoff"
date: 2026-11-05
tags: [ventures, wall-framing-takeoff, construction, roofing]
description: "The wall-framing-takeoff roof order now carries plumbing vent pipe boots from a count you type, with a spare, and prices them in the budget."
---

The roof order in `wall-framing-takeoff` covered shingles, underlayment, drip edge, ridge, starter, nails, ice shield and valley flashing, but not the flashing around plumbing vents. It now takes `roofing.pipeBoots`, the number of roof penetrations you read off the plumbing plan, and adds `pipeBootSpares` (default one) for a miscut or a bad seal. Without the field nothing changes.

The tool never guesses the count from the house, because it does not know where the plumber runs the stacks. Chimney, skylight and wall flashing are still not counted. The budget prices the boots through a `pipeBoot` key, which is listed on the page. The check is a hand-count test, not a comparison with a real roof order.
