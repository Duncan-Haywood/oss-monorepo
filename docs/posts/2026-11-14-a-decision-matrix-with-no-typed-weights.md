---
title: "A decision matrix with no typed weights: what simulated people say it costs"
seo_title: "Weighted decision matrix from pairwise comparisons, an AHP alternative"
date: 2026-11-14
tags: [decision-making, bradley-terry, ahp, javascript, quick-pick]
description: "A decision matrix filled in from 'which matters more?' picks. Adaptive questions beat random by up to 0.26 Spearman; option scores cost more than weights."
---

A spreadsheet decision matrix asks two things nobody can answer well: "how
much does rent matter, as a percentage?" and "score this flat's light out of
ten." Quick Pick's new page,
[weigh criteria by picking pairs](https://marisstella.app/quick-pick-survey/decide.html),
asks two easier questions instead:

- **Which matters more to you: Rent or Commute?**
- **On Commute alone, which is better: the flat by the station or the house with a garden?**

Each kind of answer goes into the same Bradley-Terry refit the
[list ranker](https://marisstella.app/quick-pick-survey/rank.html) runs. Each
criterion's weight is its share, so if you pick Rent over Space 3 times in 4,
Rent counts about 3 times as much. Each option's overall score is the
weighted sum of its scores on each criterion. The page draws thousands of
weightings and scores that fit your answers, so the rank range next to each
option includes doubt about the weights, not just the scores.

## Asking fewer questions than AHP

The analytic hierarchy process (AHP) asks every pair: for 8 options and 4
criteria that is 6 criteria pairs plus 4 x 28 option pairs, 118 comparisons.
The page asks fewer. Before each question it scores every question it could
ask, of either kind, by how much the answer should shrink the uncertainty
in the gap between neighbouring options that could still swap places. A
criterion whose weight is too small to change the order gets no more
questions.

On simulated people (random true weights and scores, ordinary answer noise,
12 people per row), here is how closely the shown order matched each
person's true order (Spearman correlation), compared with asking random
questions for the same number of answers:

| options x criteria | answers | adaptive | random |
|---|---|---|---|
| 5 x 3 | 41 | 0.85 | 0.60 |
| 8 x 4 | 104 | 0.70 | 0.59 |
| 12 x 5 | 230 | 0.78 | 0.56 |

## What didn't go well

The page stops when the overall order is 90% settled, the same rule the
list ranker uses. Inside the question cap that almost never happens: nearly
every simulated run reached the cap with the order 69-83% settled. That
progress reading was roughly honest, within 0.12 of the true Spearman. Part
of this is the problem itself. Averaging several independent criteria pulls
the options' overall scores together, so many neighbours are close to tied.

A diagnostic showed where the answers go. At 8 options, 4 criteria and 104
answers, the shown order scored 0.70. Giving the model each person's true
weights only lifted it to 0.77. Giving it their true option scores lifted it
to 0.90. The cost is in the per-criterion option scores, not the weights. So
the next step is graded answers ("much better" or "a bit better"), which
carry more than one bit per question. AHP's 1-9 scale is a heavier version
of the same idea.

The browser check found a bug too. The results table's "strongest on" column
named a scripted person's least-liked option as best on three criteria. The
picker had rightly skipped those criteria because their weight was too small
to matter, so a single answer had decided each "best". The column now needs
a 75% lead over the runner-up, and a test pins it.

Nothing is uploaded: options, criteria and answers stay in the browser, and
a team shares the decision as a link and sends back `QD1.` codes to combine.
The model, the tables and the open items are in
[docs/DECIDE-PAGE.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/DECIDE-PAGE.md).
These are estimates from a limited number of picks. Don't make a hiring,
financial, medical or relationship decision on them alone.
