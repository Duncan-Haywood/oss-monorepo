---
title: "\"It's between these three\" was wrong a third of the time: a credible set for your favourite in Quick Pick Survey"
seo_title: "Which items could be your favourite? A credible set from pairwise answers"
date: 2026-11-12
description: "When Quick Pick Survey can't name a clear favourite it lists the contenders. The old list of the three highest held the real favourite 68-74% of the time; a credible set from the refit holds it 88-92%."
tags: [quick-pick-survey, surveys, ranking, statistics, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
you two options at a time. Its results screen has a "top pick" card. Earlier
today we made that card much more careful: it now calls an item your clear
favourite only when your answers put it ahead of every other item by a wide
margin, which almost never happens after a few dozen taps. Every other time,
the card says "still too close to call: it's between X, Y, Z".

That line matters more than the claim it replaced, because nearly everyone
sees it. So we checked it. X, Y and Z were simply the three highest-rated
items. On simulated respondents whose true preferences we know, that list held
the real favourite only **68-74%** of the time. On a 30-item list with two
answers per item, it held it **30%** of the time.

## What replaced it

The card now lists a **credible set**: the fewest items that together carry
a 95% chance of being your favourite, under the same model that refits all
your answers at once (Bradley-Terry with a Laplace posterior). The chances
come from 4,000 seeded draws from that posterior, so the same answers always
give the same card. The list has no fixed length. If your answers have nearly
settled the question it names two items. If they haven't, it names the first
three and says how many more are still in the running ("most likely A, B, C,
or one of 4 more you rated near them").

On the same simulated respondents (8, 15 and 30 items, 2 to 8 answers per
item, 540 people per row), counting only people who actually see the line:

| respondent | three highest | credible set (95%) | set size, mean |
|---|---|---|---|
| typical, staged questions | 0.73-0.74 | 0.88 | 5.2 |
| typical, original questions | 0.68-0.70 | 0.90-0.92 | 6.1 |
| strong likes and dislikes | 0.80-0.82 | 0.93-0.96 | 5.0-5.6 |
| 20% careless taps | 0.61-0.62 | 0.76-0.83 | 5.2-6.5 |

There's also a test against the live route. Five items each beat a sixth
over and over but are never compared with each other, so any of the five
could be the favourite. The old route named three of them. The new one names
all five.

## Why it's still not 95%

A 95% set that holds the answer 88% of the time is undercovering, and we know
the cause. The refit's prior assumes preferences are spread more widely than
our simulated people's are. Under that prior the model shrinks the current
leader too little, so it is too sure the leader is ahead. This is a version of
the winner's curse: the favourite is the maximum over many items, and the
maximum of noisy estimates runs high. Per-pair intervals don't show the
problem, which is why the earlier calibration checks passed.

When we narrowed the prior just for the set, coverage reached 95%. We didn't
ship that. Tuning the prior to the simulator's own truth would calibrate the
card to our assumptions, not to real people. The principled fix is to estimate
the prior's width from each person's own answers (empirical Bayes), and that's
the next step. Until then the card shows no percentages, because the chances
behind it are known to be overconfident.

All the numbers above are synthetic: no real person's pairwise answers are in
them. The method, the sweep script and the raw results are in the repository
(`docs/INFORMATION-GAIN-SELECTOR.md`, "Who it's between";
`scripts/favourite-set-sweep.ts`; `docs/favourite-set-2026-11-12.jsonl`).
