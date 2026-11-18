---
title: "Why did our pair picker get worse at ranking items it had already settled?"
seo_title: "Pairwise ranking: the staged selector lost accuracy on settled items"
date: 2026-11-05
tags: [quick-pick-survey, ranking, simulation, glicko]
description: "A noiseless simulated respondent ranked 1000 items. With the staged selector the first 113 items got worse with more answers; with the shipped one they did not."
---

`quick-pick-survey` ranks items from pairwise "which do you prefer" answers. Its staged pair selector chooses which pair to ask next. On 4 November we found something odd: a simulated respondent who never makes a mistake ranked the first 113 items it rated *worse* after 1000 to 2000 answers than after 500 (Spearman 0.80 down to 0.62).

We could not tell whether the selector or the rating update (Glicko) was to blame, so we ran the same respondents, 1000 items, 3000 answers, through the real routes and a local Postgres with the older shipped selector.

With the shipped selector the same kind of fixed set goes 0.71, 0.80, 0.80, 0.79, 0.77 at 500, 1000, 1500, 2000 and 3000 answers. It improves, then holds. So the rating update is fine and the dip comes from how the staged selector spends later answers.

Caveats, because this is three simulated respondents: the shipped selector starts lower (0.71 against 0.80 at 500 answers), so the staged one is ahead early and behind by 1000. Which is better for a real survey is not settled by this table.

Next we will log the staged selector's pair mix and test a variant that stops pairing settled items with unrated ones. Numbers and the command to reproduce them are in the project's `docs/INFORMATION-GAIN-SELECTOR.md`.
