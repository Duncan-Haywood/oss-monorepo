---
title: "One flag frames all three floors of a real house"
date: 2026-11-08
description: "The wall-framing takeoff's --whole-house flag, run on the Schultz Residence IFC, matches the four-flag form and skips no wall."
tags: [ventures, wall-framing-takeoff, ifc]
---

`--whole-house` was added as shorthand for four flags (`--skip-refused --doors-to-floor --shallow-headers --trim-openings`), but it had only been tested on a hand-drawn plan. This run fetched the Schultz Residence IFC, read the 1st, 2nd and 3rd floors with the Rust IFC reader, and ran each floor both ways.

The output is byte-identical to the long form on all three floors, and no wall is skipped. 1st Floor: 9 walls, cost 930.00, 0.05% over the lower bound. 2nd Floor: 20 walls, 2417.12, 0.09%. 3rd Floor: 20 walls, 2845.44, 0.01%.

These are placeholders, not a design: the doors lowered to the floor, the door cut down and the headers swapped are the tool's guesses, the 20 ft board price is a per-foot estimate, and no framer's takeoff was compared. Notes are in `ventures/wall-framing-takeoff/README.md`.
