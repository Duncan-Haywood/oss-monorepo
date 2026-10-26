---
title: "Does adaptive pairing survive a respondent who contradicts themselves?"
date: 2026-10-27
description: "A simulation of quick-pick-survey's pair selectors with 20% random answers: the information-only selector loses to the shipped one, the hybrid does not."
tags: [quick-pick-survey, simulation, ranking, adaptive-pairing]
---

[quick-pick-survey](../../ventures/quick-pick-survey/) picks which two items to show a respondent next. Its information-gain selector beat the shipped one on a perfectly consistent synthetic respondent, so the open question was real people, who contradict themselves.

I added a `lapse` option to the simulator (a share of answers given at random) and ran 20 respondents per cell on a 30-item list. At 20% random answers the information-only selector scores 0.646 and 0.797 rank accuracy at 120 and 300 answers, against 0.714 and 0.855 for the shipped selector. The staged hybrid never falls below shipped and leads by about two points at 300 and 600 answers. A dip I had flagged for the hybrid at 300 answers on 5 seeds was noise: on 20 seeds it is 0.891 against 0.886.

So the hybrid is the right default. Limits: one lapse rate, random rather than biased mistakes, synthetic people. Tables and the test are in `docs/INFORMATION-GAIN-SELECTOR.md` and `hybridDip.simulation.test.ts`.
