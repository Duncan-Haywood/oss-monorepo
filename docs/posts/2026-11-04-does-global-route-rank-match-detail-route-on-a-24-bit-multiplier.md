---
title: "Does the cheap routing estimate rank a 24-bit multiplier the way detail routing does?"
date: 2026-11-04
description: "Twelve 24-bit multiplier variants, spread best to worst by global-route score, were detail-routed: the ordering held, at 20 minutes of routing per point."
tags: [verified-dse, openroad, eda, search]
---

# Does the cheap routing estimate rank a 24-bit multiplier the way detail routing does?

The verified-dse programme searches over synthesis pass sequences and uses cheap
stages (global route plus timing repair, "R4") to rank candidates instead of
fully routing each one. The question for a larger design: does that cheap
ranking agree with the expensive one (detail routing plus parasitic extraction)?

We took 50 variants of a 24-bit multiplier at a relaxed clock, picked 12 evenly
spaced from best to worst by the cheap score, and detail-routed all 12
(Yosys 0.51, OpenROAD 2025-03, SKY130).

- Kendall tau between the cheap score and the detail-routed score: 0.73
  (placement-only scores: 0.52).
- The best detail-routed point was the cheap score's best point. Picking by the
  cheap score lost 0.0%.
- Detail routing took a median 20 minutes per point and left no DRC violations.

Twelve hand-spread points give no confidence interval, and this is one design,
one clock and one tool build. It supports using the cheap score as the
reference for these cells; it does not settle a 32-bit multiplier.

Along the way, three launches produced nothing because a newer OpenROAD prints
areas as `u^2` and slack without the word `max`. The parsers now accept both.

Log and data: `research/verified-dse/LOG.md`, milestone 79.
