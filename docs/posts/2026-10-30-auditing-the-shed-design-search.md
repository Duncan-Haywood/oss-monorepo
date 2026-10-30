---
title: "Auditing a shed design search from outside: every pick was one change from better"
seo_title: "Auditing a shed design search: every pick one change from better"
date: 2026-10-30
tags: [shed-designer, optimisation, testing]
description: "An outside check found all 67 designs on the shed search's first front beaten by one change it offered. A new search order fixed most of it; a test now pins it."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) now has a design search. It looks for the sheds under 100 sq ft that nothing else beats on cost, storage and looks at once. The ready-made designs people will pick from are meant to come from it, so its picks need to be right. We checked them from outside.

**The check.** For every design on the search's front, try every single change to the knobs that mostly move cost:

- floor joist size and spacing;
- rafter size and spacing;
- stud spacing;
- overhang.

Each changed design goes through the search's own pricing, checks and scoring. If it passes and is at least as good on all three objectives and better on one, the front design should not have been on the front.

**What it found on the first version** (PR #11569), on a default run of 2,000 designs:

- All 67 designs on the front were beaten that way. The saving was 1.7% at the median and 3.6% at most, with the same storage and the same looks score.
- Every one of those changes was one the search already offered. The commonest was floor joists at 24" on centre instead of 16".

The search was not wrong; it was short of budget. It worked outward from each front design one knob at a time. A three-way front has 50 to 90 designs, each with about 30 one-knob moves, so the budget ran out before most of the front had been tried.

**Two fixes, one kept.**

- **A polish phase (not kept).** We wrote one that held half the budget back for one-change improvements to each front design. On the first version it cut the misses from 67 of 67 to 1 of 51, and the cheapest design found from $2,554 to $2,414 at 800 designs.
- **A new search order (kept).** Meanwhile the search's own lane changed the order (PR #11573). It now expands one design at a time, the best unexpanded one on each objective in turn, and also tries it in the other layouts and sizes. At 2,000 designs, 5 of 45 front designs are still beaten by a change the search offers, and the cheapest design found is $2,268.

We tried the polish on top of the new order, and it made things worse. Of the 57 designs on the combined front at 2,000 designs, 38 came from the new order alone and 19 from the order with polish. So the polish was not shipped.

| Search version, 2,000 designs | Front designs beaten by one change it offers | Cheapest design found |
|---|---|---|
| First version (#11569) | 67 of 67 | $2,468 to $2,479 (two runs, as the pricing model changed under it) |
| First version with polish (not shipped) | 1 of 51 | $2,414 |
| New order (#11573, on `main`) | 5 of 45 | $2,268 |

One gap remains for the next round. With a small budget of 800 designs, all 25 front designs are still beaten by one change (median 1.9%). Nothing on the page runs the search at that size yet, but a page that does should either use the full budget or polish its picks.

Two values the search does not offer would also help: an 8" overhang (it has 6", 9" and 12"), and 88" walls, which add 9 cu ft at no extra cost on the 8x10 and 8x11.

**The test.** `paretoaudit.test.mjs` runs a small search: one size, two layouts, 1,500 designs. It then checks that no front design is beaten by one cost-only change. The first version fails it with dozens of misses; the version on `main` passes. It shares nothing with the search but the model, the estimate and the checks.

The same audit also brute-forces about 3,500 designs around each starting preset. Every preset is within 2.5% of the cheapest design that looks the same and stores as much ([how the presets compare with store-bought kits](2026-10-30-is-a-designed-shed-a-better-deal-than-a-kit.md)).

*The search's structural checks are screening checks against NDS values. Shed Designer is not engineered or code-checked.*
