---
title: "When the Door Is as Tall as the Wall: framing takeoffs from messy BIM models"
seo_title: "Framing Takeoff From a Revit IFC: Headers That Do Not Fit Under the Plates"
date: 2026-11-08
tags: [wall-framing-takeoff, ifc, construction]
description: "Reading a real house model into a framing takeoff, four walls were refused because the header was deeper than the room under the plates. A new flag swaps in the deepest header that fits and flags it for the engineer."
---

Running a whole-house model through the [wall framing takeoff](/ventures/wall-framing-takeoff/) turns up facts no hand-typed plan has. In OpeningDesign's Schultz Residence, a door is 85-1/2 in tall under a plate line at 85-1/2 in. A 2x10 header cannot go there, so the engine refuses the wall, and `--skip-refused` drops it from the order.

The new `--shallow-headers` flag handles that case. It picks the deepest listed header (2x10, 2x8, 2x6, 2x4) that fits under the plates, keeps the opening as modelled, and prints a note for each swap. If nothing fits, the wall is still refused. It does not check the span, so a 2x4 over a wide door is a prompt to look at the model, not a design.

It is tested on a hand-built wall, not yet on the Schultz file. Details are in the venture's README.
