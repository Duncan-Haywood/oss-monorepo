---
title: "Does planning a staff schedule one week at a time cost coverage?"
date: 2026-11-01
tags: [shift-roster-builder, scheduling, optimization]
description: Over 16 seeded weeks the roster builder's week-by-week plan left as many open as each week solved fresh, so a joint multi-week solve cannot help coverage.
---

The roster builder's "Plan weeks" mode solves each week on its own and carries over the rest gap, the days-in-a-row count and the tally of closes and weekends. The obvious worry is that this rolling plan leaves shifts open that a joint solve of the whole month would fill.

A new script, `eval/rolling-gap-bench.mjs`, measures an upper bound on that. It plans four weeks for four seeded sets of 10 people and 28 shifts, then compares each week's open hours with the same week solved fresh, with no carry-over. No joint solve can beat the fresh week's proven floor.

Over 16 weeks: the rolling plan left 1,040 hours open, the fresh weeks 1,040, and no week was worse. The proven floor is 1,004. So carry-over cost nothing in coverage, and the whole 36-hour gap is the old search-versus-proof gap, which branch-and-price targets, not a rolling-plan loss.

Limits: synthetic sets, one seed, hard rules only, and the same shifts repeat every week. Pay and fairness over a month are not tested. A negative result like this is useful: it takes a large item off the roadmap.
