---
title: "Flooring now prices into the framing budget, and a silent drop is fixed"
date: 2026-11-05
tags: [construction, wall-framing-takeoff, budget]
description: "Plank, tile and carpet orders join the wall-framing-takeoff budget with a labor rate, and a bug that dropped them when sheathing nailers were added is fixed."
---

The wall-framing takeoff could already count flooring: plank boxes, tile with thinset and grout, carpet strips with pad and tack strip. Until today those counts sat beside the budget instead of inside it.

They are now a Flooring section of the budget. Each line uses the price typed in the flooring settings, or a budget price key (`plankBox`, `floorTile`, `thinsetBag`, `groutBag`, `carpetSqYd`, `carpetPadSqYd`, `tackStrip`) when one is given. A new `laborFlooringSqFt` rate adds an installation line. A quantity with no price is listed as unpriced, never guessed, as with every other line. The test checks a 10 x 12 ft plank room, an 8 x 5 ft tile bath and a 12 x 12 ft carpet bedroom against hand counts.

Writing that test turned up an older bug. When sheathing needs nailers, the CLI rebuilds the takeoff and copied back a hand-kept list of modules. The list had no flooring or paint, so any run with `--sheathing` quietly lost both from the budget. The rebuild now carries over every module already attached.

Still missing: a real flooring order to check the quantities against. Everything here is checked by hand arithmetic only.
