---
title: "Wall framing takeoff prints one sheet per shop panel"
date: 2026-10-27
description: "The PDF shop drawings now end with a sheet for every prefab wall panel, each with its own parts and lumber weight."
tags: [wall-framing-takeoff, construction, prefab]
---

Set a longest panel (for example `--panel-max=8ft`) and the PDF from [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now adds a sheet for each shop panel after the wall sheets: the panel's own elevation, openings, member marks, a parts table with the plates trimmed to the panel, and an estimated lumber weight for handling.

Gable walls and walls that fit in one panel stay as whole-wall sheets. Checked on the sample house only (96 in panels, 40 pages, rendered through poppler), not on a real builder's panel shop. Layout aid only, not engineering advice.
