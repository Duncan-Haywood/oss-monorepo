---
title: "Ceiling heat loss now has a box on the framing page"
seo_title: "Attic ceiling heat loss in the wall framing takeoff page"
date: 2026-11-03
tags: [wall-framing-takeoff, insulation, construction]
description: "The wall framing takeoff's insulation card can now add the flat ceiling under the attic to its heat-loss figure, from the page and not only the CLI."
---

The wall-framing-takeoff insulation card could already add the ceiling under the attic to a house's heat loss, but only through a plan-file key or the command line. From 2026-11-03 the page has two controls for it: a typed whole-ceiling R, or an option that takes the attic fill's R plus the wall's film and drywall layers.

The ceiling's area divided by its R joins the shell's conduction, design load and seasonal energy. A headless-Chromium click test types R-40, runs the plan and checks that the card prints the ceiling line and that the saved plan file holds `ceilingR: 40`. The arithmetic is still checked by hand only (200 sq ft at R-40 adds 5 BTU/h per degree F), joist bridging is not modelled, and no measured house has been compared. It is not an energy-code check.
