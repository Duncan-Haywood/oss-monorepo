---
title: "Fireblocking boards now reach the framing budget"
seo_title: "Fireblocking boards as a budget line in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, construction]
description: "The open-source wall framing takeoff now prices fireblocking boards in its budget, and flags misspelt fireblock, flooring and paint plan keys."
---

The `--fireblock` count (rows, blocks, boards for walls taller than a cavity limit you type) was a printout only. With `--budget` it is now a "Fireblocking boards" line, priced by `fireblock.boardPrice` or a `fireblockBoard` price; with no price it is listed as unpriced and left out of the total, never guessed.

A second fix: the plan-key spell check did not know `fireblock`, `flooring`, `paint` or `openingSchedule`, so a typo such as `fireblok` passed silently and the engine used defaults. They are known now.

Checked in `budget.test.mjs`: a 4 ft limit on the sample plan gives 49 boards, the line equals boards times the typed price, a typed `fireblockBoard` wins, and a 30 ft limit adds no line. The prices are invented.
