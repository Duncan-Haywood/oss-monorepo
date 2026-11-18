---
title: "ShootFlow's cull now says which keeper picks are toss-ups"
date: 2026-11-08
tags: [photo-editing, shootflow, culling]
description: "The cull report gives each keeper its score lead over the best alternate and flags leads under 0.03 as close calls, so shaky picks get checked first."
---

A cull that picks one keeper per burst treats a clear winner and a coin flip the same way. `shootflow cull` now records, for each keeper, its score lead over the best non-rejected alternate in the same burst. A lead under 0.03 is marked a close call in `cull_report.json` (`margin`, `close_call`, and `summary.close_calls`) and in the HTML report, which says how many to look at first.

The threshold is a guess, not a measured value. The scores are still technical signals only and have not been checked against a real photographer's picks; the useful test is whether the close calls are where the photographer disagrees with the keeper. That needs a real shoot with its picks, which the venture still wants. The change is covered by a unit test on made-up frame metrics.
