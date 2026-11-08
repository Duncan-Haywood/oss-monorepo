---
title: "How many tubes of subfloor adhesive does a floor need?"
seo_title: "Estimating subfloor construction adhesive tubes from joist length"
date: 2026-11-05
tags: [wall-framing-takeoff, floor-framing, construction]
description: "The open-source wall framing takeoff now counts subfloor adhesive tubes from the joist and rim board lengths, with the bead size and tube you type."
---

Subfloor adhesive is another line people guess. The wall framing takeoff now works it out, as an opt-in `floor.adhesive` setting.

It sums the length of every joist piece and rim board the sheets sit on. A round bead of diameter d holds pi/4 x d x d cubic inches per inch, and a 28 oz tube holds about 50.5 cubic inches, so a 3/8 in bead runs roughly 40 ft a tube before 10% waste. Whole tubes come out, and a `floorAdhesiveTube` price lands in the budget.

A test recomputes the tube count by hand from the layout's own joist and rim lengths. The tube size, bead and waste are figures you type. Doubled joists get one bead, and no real adhesive order has been compared yet.
