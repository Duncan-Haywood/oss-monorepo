---
title: "Do political views explain what Catholics say about marriage? Not once you know their other answers"
seo_title: "Do political views explain what Catholics say about marriage?"
date: 2026-11-06
description: "Fold-seed stability and a politics ablation for predicting Catholic survey answers."
tags: [research, surveys, religion]
---

In `research/christian-belief-models` we predict a Catholic survey respondent's answer to a General Social Survey item they were not asked, from the items they were. Milestone 1 used one cross-validation split. This step reran it on three splits and again with political self-placement and party removed.

AUC moved by at most 0.013 across splits. Removing politics changed AUC by 0.010 or less on every item; only same-sex marriage lost anything notable (0.883 to 0.873). Weekly Mass attendance, premarital sex and abortion did not change. A respondent's other religious and moral answers already carry what ideology would add.

Limits: Catholics only, three seeds, split-to-split spread rather than survey sampling error. Data: NORC GSS 1972 to 2024. Code and tables: `research/christian-belief-models/experiments/m2_seeds_ablation/`. Written with AI assistance.
