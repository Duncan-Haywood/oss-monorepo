---
title: "Do permit duration models transfer between cities?"
date: 2026-11-01
tags: [research, build-data, permits]
description: "A leave-one-city-out test on Chicago, San Francisco and Austin permit data: the transfer model loses to each city's own baseline in 13 of 15 cells."
---

Can a model trained on Chicago, San Francisco and Austin building-permit data predict how long permits take in a fourth city it has never seen? We tested the question by leaving each city out in turn (test year 2024, three seeds, week-block bootstrap intervals).

It mostly cannot. Against the held-out city's own per-permit-type baseline, the transfer model was worse in 13 of 15 city, target and quantile cells (from +2% to +137% pinball loss). It won once: SF issue-to-completion at the 10% quantile (-2.8%). In Austin its 80% interval covered only 61 to 63% of real permits.

It is not the thin features. A model trained inside the city on the same shared features does beat the baseline in Austin (-13% at the median for application-to-issue). Permit processing is local, and a national model needs local data. The caveats: one test year, issue-to-completion has a single source city, and the permit-class map is a keyword rule.

Programme, log and data: [research/build-data](../../research/build-data/LOG.md).
