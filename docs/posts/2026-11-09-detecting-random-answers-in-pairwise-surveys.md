---
title: "Can a pairwise survey tell when someone starts answering at random?"
seo_title: "Detecting random answers in pairwise comparison surveys (Glicko)"
date: 2026-11-09
tags: [quick-pick-survey, pairwise-comparison, negative-result]
description: "A rating-based test for random answering in an adaptive pairwise survey catches 22% of random readings and flags 7% of honest ones, so it ships unwired."
---

Quick Pick Survey ranks items by asking people to choose between two. When a
respondent tires and starts clicking at random, the survey keeps admitting new
items that only ever see noise. The obvious fix: pause admission when answers
stop agreeing with the ratings.

It did not work the obvious way. Scoring answers against the ratings after
they were fitted gave a random clicker 0.87 to 0.92 agreement, because each
answer has just moved its own pair. Scoring before the answer fixed that, but a
raw agreement share still fails: the selector pairs close items on purpose, so
an honest person agrees only 53 to 58% of the time.

A z-score against the Glicko-expected number of favoured picks is the best
version. On simulated respondents it reads below -2 on 22% of random readings
and 7% of honest ones. That is too many false pauses, so it is built, tested and
left out of the route. Next try: re-ask an earlier pair and compare, a test
that does not lean on the rating scale. Numbers and code:
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.
