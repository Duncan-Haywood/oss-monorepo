---
title: "Stress-testing a board-foot calculator with 400 random lumber lists"
seo_title: "Board foot calculator tested on 400 random lumber lists"
date: 2026-11-08
tags: [wall-framing-takeoff, lumber, testing]
description: "The board-foot calculator from wall-framing-takeoff now has a seeded property test: random lumber lists either get a reason for refusal or add up exactly."
---

Yesterday's board-foot calculator (sold size versus milled size, quarters notation, cost) had hand-checked tests only. It now also has a seeded property test, `boardfoot-fuzz.test.mjs`: 400 random lumber lists with sizes, counts, prices and waste, including bad values on purpose.

Each list must either be refused with a reason that matches the validator, or lay out so that line board feet sum to the total, pieces add up, the order is never below the net, a milled size is never above the sold size, and a cost shows only when a line has a price. No bug turned up: all 400 passed. The value is that a later change to the engine now has to keep these ties.

It tests the arithmetic, not lumber prices or grades, which you type yourself. Code is in `ventures/wall-framing-takeoff/`.
