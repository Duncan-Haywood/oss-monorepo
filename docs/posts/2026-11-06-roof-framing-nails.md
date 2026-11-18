---
title: "Counting the nails in roof framing"
seo_title: "Rafter, ridge and collar tie nails in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, roof-framing, fasteners]
description: "The open-source framing takeoff can now add rafter toenails, ridge nails and collar tie end nails to the nail total, at counts you type."
---

The nail total covered walls, sheathing, floors and braces, but not the roof. A new opt-in `fasteners.roofNails` setting adds three connections from the rafters the roof layout already placed: toenails where each rafter or jack rafter bears on the plate (default 3), nails where each common rafter meets the ridge (default 3), and nails at each end of every collar tie (default 4).

On the built-in sample roof that is 186 plate toenails, 186 ridge nails and 128 collar tie nails, 500 in all, included in the boxes to buy. Truss roofs add nothing, since trusses are a purchased line with their own connections. The counts are typed schedule values, not a code table; your engineer's nailing schedule decides the real ones. Hand-tested in `fasteners.test.mjs`, and run through the CLI on the sample roof.
