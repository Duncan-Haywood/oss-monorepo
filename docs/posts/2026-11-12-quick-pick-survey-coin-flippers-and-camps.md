---
title: "Telling coin flippers from a camp in a pairwise survey, and why it's hard"
seo_title: "Careless respondents vs real disagreement in pairwise ranking surveys"
date: 2026-11-12
description: "On real rankings, 18-46% of honest people disagree with the rest of their panel. A check on each person's own consistency spares them, but adaptive questions blunt it."
tags: [quick-pick-survey, surveys, ranking, statistics, data-quality]
---

Quick Pick Survey ranks a list by asking people "this or that?" and pooling their answers. Earlier today it switched its default question order to the adaptive one, which asks each person the pairs it is least sure about. The switch had one known cost. If half of a small panel clicks at random through the whole session, the pooled ranking comes out up to 0.025 Spearman worse than under the old order. This run tried to remove that cost without hurting the people it must not hurt: a group whose taste really differs from everyone else's.

The usual defence is to compare each person with the rest of the panel and drop the ones who disagree. We replayed real published rankings: 42 people ranking 15 breakfast foods, and 30 people voting on 11 T-shirt designs. With nobody careless at all, **18 to 46% of real people fall under the 0.2 agreement line** the survey uses for its data-quality note. Dropping them costs the pooled ranking up to 0.033. Real panels disagree a lot. This is the first real-data evidence for the survey's existing rule that agreement is a note to the owner, never a weight.

So we built a check that never looks at the panel. It refits each person's answers on four fifths of their answers and predicts the remaining fifth, five times over, scoring each prediction in bits against a coin. Someone with a stable taste, whether the majority's or their own, should predict themselves better than a coin. A coin flipper should not. Reversing someone's whole taste leaves the score unchanged, so it cannot penalise a camp.

The catch is the adaptive order itself. It asks each person the pairs it is least sure of, so even an honest person's answers carry little sign of consistency. On simulated panels, an honest respondent's Bayes factor for "has a taste" over "flips a coin" averaged about zero, and about half fell below it. Alone, the check tells coin flippers from honest people only 60 to 80% of the time.

It works better as a gate: drop someone only if they disagree with the panel *and* their own answers look inconsistent. On simulated panels that halved the cost to a 25% camp (at most 0.010, against 0.027 for plain dropping) and kept about three quarters of the gain against coin flippers. On the real panels it recovered 40 to 70% of what perfect removal of the coin flippers would give, and left out under 6% of real people with four answers per option, as long as the real people answered cleanly. If a third of their answers are random, the gate costs honest real panels up to 0.035.

That last condition decides it, and no data we have measures it: how noisy are real people's pairwise answers? So the check is in the code, tested and unwired, and the script that decides it takes a single flag once the first real survey's answers exist. Full tables and raw rows are in the [question-order notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md). Quick Pick Survey is free and open source, with a [deploy-it-yourself guide](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/README.md).
