---
title: "A careless answerer does not break a pairwise ranking at 3000 answers"
seo_title: "Pairwise survey ranking with random lapses: 3000-answer test"
date: 2026-11-09
tags: [quick-pick-survey, ranking, testing]
description: "A simulated person who answers at random one time in five still gets a rank correlation of 0.94 across 3000 pairwise answers on 1000 items."
---

Quick Pick Survey ranks a long list by asking a person to choose between two
items at a time. Last week a bug showed up only after about 3000 answers: rank
quality fell from 0.98 to about 0.65, because items were admitted to the
question pool in id order. The fix admits them by a hash of the id, and a run
through the real routes with a perfect answerer confirmed it.

A perfect answerer is not a person, so we ran the other case: a simulated
respondent who gives a random answer one time in five. Three respondents
answered 3000 questions each over 1000 items, through the real API routes
against a local Postgres database (11 minutes).

The rank correlation (Spearman) with the hidden true order, on the 113 items
rated first, was 0.92 to 0.94 at 500 answers and 0.94 to 0.95 at 3000. It did
not dip. Over all 613 items rated by 3000 answers it was 0.94, against 0.98
for the perfect answerer. That gap of about 0.04 is the price of the lapses.

Limits: three simulated people, one run, lapses spread evenly rather than
bunched late in a session when a real person tires. The next run tries
clustered lapses. Details and the table are in
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.
