---
title: "How many spare studs should a framing lumber order carry?"
seo_title: "Lumber cull allowance for a framing order: spare boards by length"
date: 2026-11-05
tags: [construction, wall-framing-takeoff, lumber, estimating]
description: "The framing takeoff now adds a typed cull allowance: whole spare boards per ordered length, kept apart from the layout order."
---

A framing order built from a layout is exact: every stud, plate and header is a piece with a length, and the cutting-stock solver buys the cheapest boards that cover them. A real delivery is not exact. Some boards arrive crowned, twisted or split, and a crew sets them aside. Estimators cover that with a spare percentage; until now `wall-framing-takeoff` had nowhere to put one.

The plan now takes `culls: {pct: 0.05}`, optionally `bySize: {"2x6": 0.1}`. For each ordered line (a length at a price) the engine adds `ceil(boards x pct)` spare boards, so a line of 12 boards at 5% gets 1 spare, not 0.6. The spares are reported separately, with their own cost and an order-with-culls total. The layout order, its cost and its LP lower bound do not move, so the optimality figures stay about the layout alone.

The rate is yours to type. The tool ships no industry cull figure, because we have no source for one, and it rejects anything outside 0 to 50%. It is engine, CLI and CSV only so far, with hand-checked rounding tests; it is not yet in the budget or on the page, and nobody has compared it with a real yard's cull rate. If you frame houses and know yours, that number is what would make this worth wiring into the budget.
