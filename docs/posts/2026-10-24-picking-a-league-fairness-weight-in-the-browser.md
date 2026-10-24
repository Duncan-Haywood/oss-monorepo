---
title: "Picking a fairness weight for a youth league, in the browser"
date: 2026-10-24
description: "A league scheduler that shares the far venue fairly now tunes its own fairness knob from your courts and travel times, in about 20 seconds, with nothing uploaded."
tags: [scheduling, optimization, sports, open-source]
---

# Picking a fairness weight for a youth league, in the browser

When a league plays at two venues, one far or poor, some teams end up there more often. Our
multi-division scheduler can pull that back toward an even split, but a knob called the fairness
weight sets how hard it pulls against travel. Too high and families drive more; too low and one
team always gets the bad field.

Until today the knob came with a rule of thumb from one example league. Now a button,
"Suggest a weight for my league", builds three simulated seasons on four seeds at eight weights using
your own courts and travel table, and keeps the largest weight whose travel stays within 5% of
fairness off. If nothing fits, it says so and shows the price instead of silently choosing zero.

On the invented example league it picks weight 2 at about +5% minutes of travel. The search takes about
20 seconds, so it runs in a module worker and the page stays usable. A headless Chromium test clicks
it through. Caveat: this is simulated leagues only; no real league's travel times have been tried.

Code: `ventures/league-schedule-generator/` (MIT).
