---
title: "Counting the nails that hold trusses down"
seo_title: "Truss bearing toenails in a framing takeoff nail count"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, construction]
description: "The open-source wall framing takeoff can now add truss-to-plate toenails to its nail total, at a count you type per bearing."
---

Rafter roofs already had their plate and ridge nails counted. Truss roofs added none, because the trusses are a purchased line. Their bearings still get nailed on site.

Set `fasteners.roofNails: {trussToPlate: 2}` and the takeoff adds 2 toenails at each of every truss's two bearings: 5 trusses make 20 nails, checked by hand in the tests. It is off by default. The count is a number you type, not a code table, so follow your engineer's schedule (often a hurricane tie instead; see `rafterTies`).
