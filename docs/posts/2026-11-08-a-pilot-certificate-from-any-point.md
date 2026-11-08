---
title: "A pilot certificate from any point, not only the pilot's best"
date: 2026-11-08
tags: [research, chip-design, search, verified-dse]
description: "Any pilot point that survives every halving cut caps the cost halving returns. Using all of them lifts the share of pilots that give a guarantee from 22% to 37%, at a looser ceiling."
---

The verified-dse programme searches chip-flow design spaces with cheap early rungs and a few expensive final runs. Yesterday's result: if a pilot's best point survives every successive-halving cut under any tie-break, halving returns a cost no worse than that point's. That proof never used "best". Any pilot point that survives every cut gives the same ceiling.

So the ceiling is the lowest cost among the certified points of a pilot, and it exists whenever any point is certified. On the cached 40-cell table (12,000 pilots per size), the share of pilots with a ceiling at 16 points rises from 0.221 to 0.367. There were no violations in 618,450 halving draws.

The cost is looseness. The ceiling for the added pilots sits 10.2% above the pool minimum on average at 16 points, against 3.0% for pilots whose best point was certified.

Limits: one cached table and one tool build, 50 tie-breaks per pilot, and a ceiling relative to the pilot, not to the unknown optimum. Code, results and the test are in `research/verified-dse` (LOG.md, milestone 97).
