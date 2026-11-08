---
title: "One bad wall no longer hides the rest of the takeoff"
date: 2026-11-08
tags: [construction, wall-framing, cli, open-source]
description: "wall-framing-takeoff gains --skip-refused: it frames the walls that pass the checks and lists the ones that do not."
---

A whole-house model read from IFC or DXF nearly always has a few walls the framing checks refuse: an opening drawn against a wall end, a header too tall for its plates. Until now the takeoff stopped at the first refusal, so one wall hid the numbers for the other forty.

`wall-framing-takeoff` now takes `--skip-refused`. It drops each wall the plan checks name, frames the rest, and prints a `SKIPPED n WALLS` list with each reason at the top. If every wall is refused it still stops, and errors that name no wall (stock, spacing) are not skipped past.

Limits: the skipped walls are missing from the quantities, so fix them before ordering. The test is a two-wall hand plan; the flag has not been re-run on the Schultz Residence file. Code and test are in `ventures/wall-framing-takeoff` (`cli.mjs`, `cli.test.mjs`).
