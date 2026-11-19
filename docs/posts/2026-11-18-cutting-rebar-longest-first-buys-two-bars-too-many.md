---
title: "Cutting rebar longest-first: when it buys two bars too many, and how to prove the plan can't be beaten"
seo_title: "Rebar cutting optimizer: bar bending schedule with a proven bound"
date: 2026-11-18
tags: [construction, rebar, optimization, rebar-schedule]
description: "A free tool reads a bar bending schedule, works out BS 8666 cut lengths and weights, and cuts 12 m stock bars with a plan proven optimal in 197 of 200 tests."
---

There is a new free tool in the catalogue: the [bar bending schedule calculator and rebar cutting optimizer](https://marisstella.app/rebar-schedule/). Paste a schedule (mark, size, shape code, dimensions, number of members, bars in each) and it gives back every cut length, the weight per bar size, and which pieces to cut from each 12 m stock bar so the least steel is bought. Nothing is uploaded.

## A bent bar is shorter than its dimensions

Schedule dimensions are outside dimensions. At a 90° bend the bar goes round a curve, so each bend takes some length off the sum of the legs: 2(r + d) − π/2 (r + d/2), where r is the bend radius and d the bar size. BS 8666 sets the minimum radius at 2d up to 16 mm and 3.5d from 20 mm. Fabricators' shape-code charts round that deduction to 0.5r + d per bend (an L-bar is A + B − 0.5r − d). The tool uses the chart formulas for shapes 00, 11, 21 and 51, and its tests check them against the exact geometry at every standard size. They agree within a tenth of a bar diameter per bend: for a 12 mm bar the geometry gives 24.9 mm and the chart 24 mm.

## Longest-first cutting

The steel bill is in the cutting. The usual hand method is first-fit decreasing: take the longest piece, put it in the first stock bar it fits, repeat. In the tool's example the 12 mm bars are 48 × 5400, 32 × 2250 and 16 × 2100. Longest-first puts two 5400s in each of 24 bars, leaving 1200 mm offcuts nothing else fits, and ends at **34 bars**. One 5400 + two 2250s + one 2100 fills a 12 m bar exactly, and using that pattern 16 times gives **32**.

How do we know 32 is the best possible? The steel alone is 364.8 m, 30.4 bars, so length alone does not prove it. The tool solves the cutting-stock problem the way Gilmore and Gomory did in 1961. The linear relaxation is solved by column generation: a simplex over the patterns found so far, plus a knapsack programme that searches every possible pattern for one that would lower the cost. When none does, the LP value is proven, and no whole-bar plan can beat it. Here it is exactly 32.0 bars. The tool then builds whole-bar plans five ways (rounding, diving, best-fill, first-fit) and keeps the cheapest. When that plan meets the bound, the page says *proven optimal*.

## How often it is optimal, and what it saves

On 150 small random schedules, checked against an exhaustive search, the plan was optimal every time. On 200 larger generated schedules (4 to 25 lengths per bar size, 2 to 60 of each, from 12 m stock), the plan met the proven bound in 197 and was at most one bar over in the other 3. Longest-first bought more bars in 122 of the 200 and about 1.0% more steel overall: 6.4% waste against 5.4%. These are generated schedules, not real jobs, so read 1% as an order of magnitude. On a job buying 50 tonnes of rebar it is about half a tonne. The script is `check/benchmark.mjs` in the [source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/rebar-schedule).

The tool does not cover other shape codes, laps, or a fabricator's own radii and rounding. It is a check on a schedule and a cutting plan, not detailing software. The [worked explanation](https://marisstella.app/rebar-schedule/how-to-calculate-bar-bending-schedule.html) goes through all of it by hand.
