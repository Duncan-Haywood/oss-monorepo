---
title: "Gable dormer framing now has a card on the takeoff page"
date: 2026-10-31
tags: [wall-framing-takeoff, dormer, roof, takeoff]
description: "The dormer framing quantities (cheek studs, commons, valleys, ridge, header) were command-line only. Four page fields now drive them."
---

The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) could count the lumber in a gable dormer from the command line (`--dormer`) since earlier today. The page now has a "Also frame a gable dormer" tick box with four fields: width, eave height on the front wall, dormer pitch, and main roof pitch (blank takes the roof option's pitch). The result card lists ridge, valley and common lengths, where the cheeks meet the main roof, and every part with its count.

The geometry is closed-form (the cheek studs shorten with the main roof's slope; commons stand until the eave clears, then become jacks to the valleys), so a person can check the numbers with a tape measure and a calculator. The dormer is saved in the plan file and restored when you open it.

Checked: the page test pins the wiring, and the Chromium click test types 72 in wide, 48 in eave, 8:12 and reads the card and the saved plan. Not done: the opening cut in the main roof is a CLI option only, sizes are defaults not span-checked, and no real dormer plan has been run through it.
