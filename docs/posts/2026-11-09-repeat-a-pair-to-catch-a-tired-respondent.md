---
title: "Can you catch a tired survey respondent by repeating a question?"
seo_title: "Repeat-pair consistency checks in adaptive pairwise surveys: why they need lopsided pairs"
date: 2026-11-09
tags: [quick-pick-survey, pairwise-comparison, negative-result]
description: "Repeating an adaptive survey's own pairs needs 3,549 repeats to spot a respondent who answers 20% at random; a lopsided catch pair needs about 100."
---

A common way to catch a respondent who has started clicking at random is to
ask the same question twice and see whether the answers agree. We tried the
idea on Quick Pick Survey's adaptive pair selector, by calculation on the
simulator's known item strengths.

The catch is that an adaptive selector shows pairs that are close on purpose,
because those teach it the most. On the pairs it really shows, an honest
respondent repeats their first answer only 61% of the time, a respondent who
answers 20% of questions at random does so 57% of the time, and a pure random
clicker 50%. Telling the first two apart takes 3,549 repeats. Even a
random clicker needs 465.

A lopsided "catch" pair, with the top item against the bottom one, behaves
very differently: honest agreement 94%, 20% lapser 78%, random 50%. About 18
repeats catch a random clicker and about 100 a 20% lapser. Each repeat is an
answer that does not help the ranking, so the probe is not built into the
survey: it costs respondent time for a failure that the ranking already
tolerates up to a fifth of answers. The numbers and code are in
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md` (simulation, no
real respondents yet).
