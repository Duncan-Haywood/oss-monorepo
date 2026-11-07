---
title: "Does the factory sample match the spec? A measurement table and a pass/fail check for clothing brands"
seo_title: "Garment spec sheet and sample check, free"
date: 2026-11-07
tags: [clothing-design-studio, fashion, tools]
description: "The Clothing Design Studio tech pack now has a points-of-measure table with tolerances for each size, and a page that checks a sample against it."
---

A first sample arrives and the chest "feels tight". Without a table of measurements and tolerances, that is an argument. The Clothing Design Studio tech pack now includes one: half chest, hem, body length, sleeve, across shoulder and neck opening for every size, each with a tolerance, printed next to the artwork placements.

A new page, `spec.html`, goes one step further. Pick the garment and cut, type what you measured on the sample laid flat, and each point comes back pass, over or under, with a plain comment to send the factory ("half chest: 1.5 cm too big, tolerance +/-1").

What it is not: the tolerances (about 1 cm on width and length, 0.5 cm on the neck) and the shoulder and neck figures are typical trade values written from general knowledge, not a standard or any buyer's table. The page says so, and the sleeve length takes the factory's own figure. Tests are hand-computed (a regular tee in M is 56 cm half chest, 71 cm long), and the page was clicked in headless Chromium. No designer has run a real sample through it yet.

Code, MIT licensed: `ventures/clothing-design-studio/spec.mjs`.
