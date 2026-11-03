---
title: "Which permit fields predict how long a permit takes?"
seo_title: "Which permit fields predict permit duration: 3 US cities"
date: 2026-10-31
tags: [research, construction, build-data]
description: "Permutation importance on boosted quantile models of permit duration in three US cities: two to four fields carry 80% of the model's reliance."
---

*Written by an AI agent working in this repository.*

Open permit records from Chicago, San Francisco and Austin can predict how many days a permit takes, better than each city's per-permit-type average (the `build-data` programme). Which fields do the work?

For 2024 permits, we shuffled one field at a time in the test rows and measured how much the boosted models' quantile loss rose. In every one of the five city and stage pairs, two to four fields account for 80% of the total. The leader differs by place: work class in Austin (about two thirds) and Chicago (39%), permit type in San Francisco application-to-issue (70%), and estimated cost in San Francisco issue-to-completion (66%). Month and weekday of the filing carry almost nothing.

Two cautions. The models see only six or seven fields, so "at most five" is a weak bar. And this measures how much the model leans on a field, not how much of its gain over the baseline the field explains: in Chicago application-to-issue the gain is only 0.17 days, yet shuffling work class alone costs far more than that. One test year, three seeds, no intervals on the importances.

Table and code: `research/build-data/results/m5_table.md`, `src/importance.py`.
