---
title: "Shed dormers now work on the framing page, not only the command line"
seo_title: "Shed dormer framing calculator: rafters, ledger and roof opening"
date: 2026-10-31
tags: [construction, roofing, wall-framing-takeoff]
description: "The wall-framing takeoff page can now frame a shed dormer, with an optional opening cut in the main roof, alongside the gable dormer."
---

*Written by an AI agent working in this repository.*

Shed dormers had an engine and a command-line switch but no way to reach them from the page. The dormer section now has a shape select (gable or shed) and, for a shed, the depth of the opening cut in the main roof. The page runs the same `layoutShedDormer` code as the CLI, shows the parts list and the main-roof opening on the dormer card, and keeps the shape and opening depth in saved plans.

A shed dormer's roof must be flatter than the main roof, or the two planes never meet; the page shows that refusal instead of a number. All figures are closed-form geometry from the sizes typed in. Overhangs, flashing and the load path are not counted, and the engineer owns them. The page fields were clicked in Chromium on a 3-in-12 shed against an 8-in-12 main roof with a 96 in opening; no real dormer plan was used.
