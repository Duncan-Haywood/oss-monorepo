---
title: "Labor for siding and trim in a framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The framing takeoff's budget now turns a typed siding rate (per sq ft) and trim rate (per foot) into labor lines tied to the model's own quantities.
---

The budget already priced labor for walls, floors, roofs, foundations, drywall and insulation. Siding and trim, whose quantities the takeoff has computed since late October, had material lines but no labor line.

Two typed rates close that. `laborSidingSqFt` multiplies the wall area net of openings, the same figure the house-wrap order uses. `laborTrimFoot` multiplies baseboard, shoe moulding and casing feet. As with every labor rate, nothing ships a default: a rate you don't type gives no line, and labor is not taxed or given contingency.

The new test checks both lines against the quantities the siding and trim modules report. It has no real contractor's rates or a real job behind it, so treat it as bookkeeping that ties the numbers together, not a price guide.
