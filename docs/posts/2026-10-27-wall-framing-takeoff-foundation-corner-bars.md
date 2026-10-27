---
title: "Wall framing takeoff counts foundation corner bars"
date: 2026-10-27
description: "The foundation rebar count can now run straight bars along each side with an L-bar at every corner, instead of one bent loop."
tags: [wall-framing-takeoff, construction, concrete]
---

The foundation count in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) used to assume each horizontal rebar layer was one loop bent at the corners on site. Many crews instead run straight bars along each side and tie an L-bar into every corner.

Set `cornerBars` in the plan's foundation (or pick it in the page's foundation section) and the footing and stem layers are spliced side by side, with one L-bar per layer per corner, each leg one lap long (40 bar diameters). The cut list shows the sides and the corner bars as separate lines, so the steel order matches what the crew bends.

Checked by hand arithmetic on the sample house only (8 footing and 8 stem corner bars, #4 legs of 20 in), not against a real foundation plan. Estimates only, not engineering advice.
