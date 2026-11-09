---
title: "What a tiring respondent does to a pairwise ranking"
seo_title: "Pairwise ranking survey with respondent fatigue: measured effect"
date: 2026-11-09
tags: [quick-pick-survey, ranking, testing]
description: "A simulated respondent answers well for 2000 comparisons, then half their answers turn random. The items already ranked hold at 0.98; the late ones fall to about 0.89."
---

Quick Pick Survey ranks up to thousands of items from "which do you prefer?"
answers. Earlier runs tested respondents who are noisy throughout. A real person
more often answers well and then tires, so I ran that through the real routes
and a local Postgres: three simulated respondents, 1000 items, 3000 answers each,
clean for the first 2000 and a random answer half the time after that.

- Items ranked before the fatigue kept their order: Spearman 0.98 against the
  hidden order at 3000 answers, unchanged from before it began.
- Over all 613 items rated, the score fell from 0.98 at 2000 answers to 0.886-0.895
  at 3000, because the 200 items first shown after the onset only ever saw
  half-random answers. That is lower than a respondent who is noisy throughout
  (0.938), who at least has some clean answers on every item.

So the ranking is safe for what was settled, but the selector keeps introducing
new items to a person who is no longer answering well. The next thing to try is
pausing admission when recent answers disagree with the current ordering. These
are simulated respondents, not people; a real fatigue curve is still unmeasured.
Numbers and the command: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`.
