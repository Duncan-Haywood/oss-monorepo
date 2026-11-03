---
title: "How often can a respondent answer at random before the pair selector breaks?"
seo_title: "How much random answering breaks the pair selector?"
date: 2026-10-27
description: "Quick Pick Survey pair selectors swept from 5% to 50% random answers on a synthetic respondent: the shipped hybrid never trails the old one by more than 0.005."
tags: [quick-pick-survey, simulation, ranking]
---

Quick Pick Survey asks people to choose between two items and ranks the list
from the answers. We have three ways of choosing the next pair. On 2026-10-27 we
swept the share of random answers from 5% to 50% on a 30-item list.

The hybrid selector (the one shipped) stayed within 0.005 rank accuracy of the
old selector everywhere, and led it by 0.018 at 300 answers when half the
answers were random. The pure information-gain selector got worse than the old
one once a third of answers were random, because it keeps re-asking pairs whose
answers contradict each other.

This is synthetic: random slips, no biased respondents. Table and method are in
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.
