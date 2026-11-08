---
title: "Flattening a boosted permit-duration model into a table throws the gain away"
date: 2026-11-08
description: "A table of boosted quantile predictions by permit type and cost bucket kept at least half of the model's gain in only one of five city and target sets."
tags: [research, build-data, construction, negative-result]
---

We wanted to ship the boosted permit-duration model's gain to a calculator as a small table, since a table is readable and a model file is not. Each cell of permit type by cost bucket took the median of the model's q10, q50 and q90 predictions.

On 2024 permits from Chicago, San Francisco and Austin, written down in advance as "keeps at least half of the gain in at least 4 of 5 sets", it did so in one: San Francisco application to issue (83% of the gain). The rest ranged from 4% down to minus 10%. A cell median of q90 predictions is not the cell's q90, and the gain at the median comes from description length, area and month, which the table drops.

So no boosted table is published. The empirical per-type prior stays the shipped artefact. Code, results and the log are in `research/build-data/` (session 50); next is refitting a quantile model on type and cost alone, or shipping the model itself.
