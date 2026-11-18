---
title: "Short surveys now get the better question picker from the first answer"
seo_title: "Pairwise survey question order: when to use information gain"
date: 2026-11-10
tags: [quick-pick-survey, ranking, simulation, pairwise-comparison]
description: "Quick Pick Survey's sharper question order now starts at the first answer on lists up to 120 options; the couple screen opens 4 to 8 answers sooner."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to choose between two options at a time. Which two to show next is the
whole game. One selector spreads questions evenly with some weighting; the
other asks the pair whose answer would teach it the most (expected variance
reduction under Glicko-2).

The "sharper" survey setting used the even one for the first 120 answers and
the informative one after. That 120 was chosen on 41- and 220-item lists. On a
15-item list almost nobody answers 120 pairs, so the better selector never
ran. Last run's test on real people's published rankings (PrefLib breakfast
foods and T-shirt designs) showed the informative selector ahead in all 25
cells.

## The bar we had been measuring was the wrong one

The 120 was justified by "items under rating deviation 150", described in the
docs as the couple screen's bar. The code says otherwise: the couple screen
compares two people once each has **8 items under rd 200**. So we measured
that, on a synthetic respondent, 30 respondents per list length:

| options | answers to the couple bar, old | new |
|---:|---:|---:|
| 8 | 26 | 19 |
| 15 | 34 | 27 |
| 30 | 39 | 35 |
| 80 | 40 | 35 |
| 120 | 40 | 35 |

(medians; the new selector's 90th percentile sits within one answer of its
median, the old one's 5 to 10 answers later). Rank accuracy was higher at
every length and budget measured except one cell, where it was within noise.

So "sharper" now starts at the first answer on lists up to 120 options. Longer
lists keep the 120-answer switch, because we did not measure them. On the real
rankings the setting now matches the informative selector in all 25 cells.

## What it costs, and what we did not test

- On long lists answered briefly (under about three answers per option), the
  old selector gets a few options to the stricter rd 150 sooner. No screen
  uses that bar.
- With 35 to 50% of answers given at random, the informative selector trailed
  by up to 0.06 rank on 15 and 30 options. "Sharper" only falls back for
  position bias today; a careless-answer fallback is next.
- Synthetic answerers and published rankings, not real people answering
  pairs on the site.

Tables and method: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`,
"A switch point that depends on list length"; reproduce with
`npx tsx scripts/couple-bar-sweep.ts`.
