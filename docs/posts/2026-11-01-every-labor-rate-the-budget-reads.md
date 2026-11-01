---
title: "Every labor rate the framing budget reads is now named on the page"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The takeoff page's price box now lists all thirteen typed labor rates, and a test keeps the list in step with the budget engine.
---

The budget engine has grown labor lines one at a time: siding and house wrap, trim, eaves, gutters, wall sheathing, hold-downs. The page's price box only listed the first six, so a builder reading it had no way to know the others existed. The box accepts any name, so typing them worked; finding them did not.

The hint now names all thirteen `labor*` rates, and `page.test.mjs` reads `budget.mjs`, collects every labor name the engine asks for, and fails if the page's hint leaves one out. Still true: no price or rate ships with the tool, and an untyped rate leaves its line listed as unpriced, never guessed.
