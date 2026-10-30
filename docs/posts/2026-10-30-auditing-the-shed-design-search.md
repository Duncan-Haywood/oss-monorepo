---
title: "Auditing a shed design search from outside: every pick was one change from better"
date: 2026-10-30
tags: [shed-designer, optimisation, testing]
description: "An outside check found all 67 designs on the shed search's front beaten by one change it offered. A polish phase fixed it and cut the cheapest pick by $140."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) now has a design search. It looks for the sheds under 100 sq ft that nothing else beats on cost, storage and looks at once. The gallery of ready-made designs is built on it, so its picks need to be right. We checked them from outside.

**The check.** For every design on the search's front, try every single change to the knobs that mostly move cost:

- floor joist size and spacing;
- rafter size and spacing;
- stud spacing;
- overhang.

Each changed design goes through the search's own pricing, checks and scoring. If it passes and is at least as good on all three objectives and better on one, the front design should not be on the front.

**What it found.** On a default run of 2,000 designs:

- All 67 designs on the front were beaten that way. The saving was 1.7% at the median and 3.6% at most, with the same storage and the same looks score.
- Every one of those changes was one the search already offered. The commonest was floor joists at 24" on centre instead of 16".

The search was not wrong; it was short of budget. It works outward from each front design one knob at a time, but a three-way front has 60 to 90 designs, each with about 30 one-knob moves. The 2,000-design budget ran out before most of the front had been tried.

**The fix** is a polish phase. Half the budget is kept back for it once anything passes. Each front design, cheapest first, takes any one change to the cost-only knobs that beats it outright, and keeps going until nothing does.

**Results**, comparing the old and new searches run side by side:

| Budget | Designs on the combined front | from the old search | from the new | Cheapest design found |
|---|---|---|---|---|
| 800 (in the browser) | 59 | 13 | 46 | $2,554 → $2,414 |
| 2,000 (default) | 61 | 14 | 47 | $2,479 → $2,414 |

At 2,000 designs the search now finishes early, at 1,800, because the polish runs out of improvements. After the fix, 1 of 51 front designs is still beaten by a change the search offers. 21 are beaten only by values it does not offer, by 0.1% at the median:

- an 8" overhang, between its 6", 9" and 12";
- 88" walls, which add 9 cu ft at no extra cost on the 8x10 and 8x11.

Both are notes for the search's next round.

There is one trade-off: with half the budget on polish, the single roomiest design on a 2,000-design front holds 802 cu ft instead of 821. A test now pins the fix. It runs a small search to completion, then checks that no front design is beaten by one cost-only change. The old search fails it: it does not finish inside its budget.

The same audit (`paretoaudit.mjs`) also brute-forces about 3,500 designs around each starting preset. Every preset is within 2.5% of the cheapest design that looks the same and stores as much ([how the presets compare with store-bought kits](2026-10-30-is-a-designed-shed-a-better-deal-than-a-kit.md)).

*The search's structural checks are screening checks against NDS values. Shed Designer is not engineered or code-checked.*
