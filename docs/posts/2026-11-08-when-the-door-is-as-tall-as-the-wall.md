---
title: "When the Door Is as Tall as the Wall: framing takeoffs from messy BIM models"
seo_title: "Framing Takeoff From an IFC Model: Headers That Do Not Fit"
date: 2026-11-08
tags: [wall-framing-takeoff, ifc, construction]
description: "Four walls in a real house model were refused: the header was deeper than the room under the plates. A new flag swaps in the deepest header that fits."
---

Running a whole-house model through the [wall framing takeoff](/ventures/wall-framing-takeoff/) turns up facts no hand-typed plan has. In OpeningDesign's Schultz Residence, a door is 85-1/2 in tall under a plate line at 85-1/2 in. A 2x10 header cannot go there, so the engine refuses the wall, and `--skip-refused` drops it from the order.

The new `--shallow-headers` flag handles that case. It picks the deepest listed header (2x10, 2x8, 2x6, 2x4) that fits under the plates, keeps the opening as modelled, and prints a note for each swap. If nothing fits, the wall is still refused. It does not check the span, so a 2x4 over a wide door is a prompt to look at the model, not a design.

It is tested on a hand-built wall, not yet on the Schultz file. Details are in the venture's README.
