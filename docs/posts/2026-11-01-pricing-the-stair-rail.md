---
title: "Pricing a stair rail: balusters, posts and brackets in the budget"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, budget]
description: The framing takeoff's budget now counts a stair's balusters, guard posts and handrail brackets and prices them from typed unit prices.
---

A stair rail was the last stair part the budget left out. The rail rails and handrail lumber already ride in the cutting-stock order, but the pieces bought by the each, balusters, posts and wall brackets, had no line.

Add a `rail` to a stair and set `stairBaluster`, `stairRailPost` and `handrailBracket` in the plan's `prices`. The counts come straight from the rail layout: balusters spaced so no gap passes a 4 in sphere, posts no more than 72 in apart, and brackets near each end of the handrail with enough between to keep the typed spacing. With no price a quantity is listed and left out of the total, as with everything else in the budget. No prices ship with the tool.

Checked against the engine's own counts in `budget.test.mjs`. There is no real rail order behind it yet, only the layout arithmetic.
