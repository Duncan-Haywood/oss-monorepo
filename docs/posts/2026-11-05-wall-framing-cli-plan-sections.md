---
title: "Feeding a framing CLI plan sections that are the wrong shape"
seo_title: "Wall framing takeoff CLI: bad stairs and floor sections"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, construction]
description: "A sweep of 21 plan sections with 7 wrong-shaped values each found a stairs crash and a floor error that printed the word undefined."
---

The wall framing takeoff CLI reads a JSON plan with optional sections (roof, deck, stairs, floor and so on). A sweep wrote each of 21 sections as `null`, a number, text, an empty list, a list holding `null` and two objects with bad widths, then ran the matching flag: 147 runs.

Two things turned up. `"stairs": [null]` crashed with a raw TypeError, and a floor with no joist size said "Unknown joist size undefined" and then "No undefined boards listed in the stock".

Now a stair entry that is not an object reports which stair, and a floor with no joist size says the size is missing. Two tests cover them; the CLI and floor suites pass (73 tests). Inputs were invented, not a real builder's plan.
