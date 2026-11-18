---
title: "Nailing the blocking: a gap in a framing nail count"
seo_title: "Counting nails for wall blocking and fire blocking in a takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, construction]
description: "The open-source wall framing takeoff placed blocking and fire blocking but never counted its nails. It now does, at a typed count per end."
---

The wall framing takeoff already places blocking between studs, fire blocking at 10 ft and ladder blocking at tees. Its nail count skipped all of it: every blocking piece was lumber on the list and zero nails in the box total.

A new `fasteners.blockingEndNails` setting (default 2, range 1 to 6) now counts that many nails at each end of every blocking piece, as a "Blocking ends" connection beside the stud and sill ends. A test counts five pieces by hand (5 x 2 ends x 2 nails = 20) and again with 3 nails per end (30). The existing fastener, budget and CLI tests still pass (98).

The default is common practice, not a code table, and nothing here sizes nails or checks shear. No real house's blocking and nailing schedule has been compared.
