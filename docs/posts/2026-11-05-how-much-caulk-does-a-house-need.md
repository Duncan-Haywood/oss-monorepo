---
title: "How many tubes of caulk does a siding job need?"
seo_title: "Estimating caulk tubes for siding from openings and corners"
date: 2026-11-05
tags: [wall-framing-takeoff, siding, construction]
description: "The open-source wall framing takeoff now counts siding caulk from opening perimeters and corner board edges, with the bead size you type."
---

Caulk is the line estimators guess. The wall framing takeoff now works it out, as an opt-in `siding.caulk` setting.

It adds the perimeter of every exterior opening to both edges of every corner board, in feet. A tube's reach comes from its volume: a 10.1 oz tube holds about 18.2 cubic inches, and a 1/4 in fillet bead has a cross-section of leg x leg / 2, so one tube runs about 48.6 ft. Whole tubes come out with the same waste as the rest of the siding, and a `caulkTube` price lands in the budget.

A hand-worked test pins it: a 36 x 48 window and a 60 x 80 door give 448 in, or 37.3 ft, which is one tube. The tube size, bead and waste are figures you type. Butt joints are not counted, and no real caulking order has been compared yet.
