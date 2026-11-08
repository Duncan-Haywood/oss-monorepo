---
title: "A pilot certificate for chip-flow search guarantees 'no worse than the pilot', not 'near the optimum'"
date: 2026-11-08
tags: [research, chip-design, design-space-search, successive-halving]
description: "In halving chip-flow search, a certified pilot guarantees the returned cost is at most the pilot's best: 0 violations in 1.5M draws, about 2.7x the realised regret."
---

When a search spends cheap synthesis scores to cut candidates before paying for place-and-route, can a small routed pilot tell you the search is safe? Yesterday's check said a "certified" pilot (its best point sits inside every cut under any tie-break) does not bound regret against the pool optimum: one cell had 50% certified pilots and 13.9% mean regret.

What it does bound is simpler. A certified point survives every cut, so the search returns a cost no worse than the pilot's best. We replayed 40 design-by-clock cells from the cached 1,200-run SKY130 table with 300 pilots each and 200 tie-breaks: 0 violations in 397,400, 529,800 and 617,000 draws at pilot sizes 8, 16 and 24. At 16 points the pilot's best exceeds the pool minimum by 3.0% on average, against realised regret of 1.1%, so the ceiling is about 2.7 times loose. The search beats the pilot's best in 52% of draws at 16 points (I had predicted under half).

Limits: ten small designs, one corner, and nothing here is relative to the unknown optimum. Code and log: `research/verified-dse` (milestone 96).
