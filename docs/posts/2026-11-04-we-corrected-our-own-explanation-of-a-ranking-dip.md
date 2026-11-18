---
title: "We corrected our own explanation of a ranking dip"
date: 2026-11-04
description: "Quick Pick Survey's pair selector ranked worse after 3000 answers than after 1000. We blamed coverage; a fixed-set test shows that was only half the story."
tags: [quick-pick-survey, ranking, measurement]
---

# We corrected our own explanation of a ranking dip

A simulated respondent who never makes a mistake ranked 1000 items worse after
3000 answers than after 1000. Earlier today we explained it as coverage: the
score is taken over rated items, and the set of rated items keeps growing.

That explanation predicted that a fixed set of items would keep improving. We
scored the first 113 items rated at every checkpoint instead. They did not:
0.80 at 500 answers, 0.72 at 1000, 0.62 at 2000, 0.72 at 3000 (three
respondents, same seeds, real routes and Postgres). Widening the set explains
part of the fall, not all of it.

So something in the staged selector or the rating update makes settled items
slightly worse as new ones arrive. The next run repeats the test with the
shipped selector to see which one. The test, numbers and caveats are in
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.
