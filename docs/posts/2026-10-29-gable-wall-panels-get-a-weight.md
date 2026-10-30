---
title: "Gable-end wall panels now carry a sheathing weight"
date: 2026-10-29
description: "The wall-framing takeoff's shop panels skipped sheathing weight on gable walls. They now count the eave rectangle plus the triangle under each panel."
tags: [wall-framing-takeoff, construction]
---

`wall-framing-takeoff` splits long walls into transportable shop panels and
gives each a handling weight: lumber, plus sheathing at a typed lb per sq ft.
Gable-end walls were left at zero sheathing weight, so the heaviest panels in
a house, the ones with a triangle on top, looked lighter than they are.

A gable wall now records its eave height. Each panel's sheathed area is the
eave rectangle plus the triangle under its span, split at the peak when a
panel straddles it, less openings. The test checks that panel areas add up to
the whole wall's rectangle plus triangle, for one panel and for a wall split
in three. It is a handling estimate, as before, not a load figure.
