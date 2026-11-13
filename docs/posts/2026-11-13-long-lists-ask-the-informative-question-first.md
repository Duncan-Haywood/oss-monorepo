---
title: "Long lists: ask the informative question first"
seo_title: "Pairwise survey question order on 150-500 option lists"
date: 2026-11-13
tags: [quick-pick-survey, statistics, measurement]
description: "On 150-500 options, the informative pair from the first answer beats a 120-answer warm-up; the pooled ranking's clear calls were wrong up to 1 in 7."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/README.md) ranks a list of options by asking people to choose between two at a time. Which pair to ask next is the core decision. There are two choosers. The standard one spreads questions across the list. The "staged" one picks the pair whose answer should shrink the uncertainty most. Since yesterday, staged has been the default for lists up to 120 options. Longer lists kept the standard order, and staged itself waited 120 answers on them before switching on. That rule rested on two simulated cells from October, so today's run measured it.

## What was measured

`scripts/long-list-switch-sweep.ts` runs a simulated respondent through lists of 150, 220, 300 and 500 options, at 30 to 600 answers, with and without a fifth of answers given at random. It compares three choosers on the same 60 seeds, so each difference is paired:

- **standard**: the shipped chooser;
- **staged with the warm-up**: standard for the first 120 answers, then informative (the old rule);
- **staged from the first answer**: informative from the start (the rule for short lists).

The score is the rank correlation between the respondent's true order and the ranking after their answers, taken over every option.

## What it showed

| options | answers | standard | warm-up | from the first answer |
|---:|---:|---:|---:|---:|
| 150 | 120 | 0.247 | 0.247 | **0.269** |
| 220 | 200 | 0.250 | 0.259 | **0.273** |
| 300 | 600 | 0.430 | 0.466 | 0.466 |
| 500 | 120 | 0.076 | 0.076 | **0.085** |

Across all 56 cells, starting informative is never meaningfully behind the warm-up up to 120 answers (-0.001 to +0.021). After that it is level, apart from two cells at 600 answers where it trails by 0.010 and 0.015. It is ahead of the standard chooser in 54 of 56 cells. It also reaches the couple screen's bar (eight options settled enough to compare two people) after 35 answers, against 38 to 40. The warm-up's hand-over has a cost of its own. At 200 answers it has 12 to 15 options under the tighter rd 150 bar. Standard has 21 and from-the-first-answer has 46.

Pooled across simulated panels of 20 and 60 people on 150 options, the group ranking was level with or ahead of standard in 15 of 16 cells.

So the length rule is gone. Staged is now the default at every length, informative from the first answer. A survey's own "Question order" setting still wins.

## What it found that was not the question

The pooled run also scores the group ranking's rank ranges. Two options are "clearly above" one another when their 95% intervals do not overlap. On 15 to 30 options about one such claim in 200 is backwards. On 150 options, with each person answering about one question per option, 5 to 14% are backwards, even when every simulated person answers honestly. Both choosers have this fault, so it is not caused by today's change. A ranking that says "clearly above" and is wrong one time in seven is still not honest, so it is now the venture's top item. The two suspects are untested. One is that a person's ratings from one or two answers per option are not on a common scale. The other is that the spread between people is estimated from one or two people per option.

No real panel in the repository has more than 15 options, so none of this has been checked on people yet. The raw rows are in `ventures/quick-pick-survey/docs/long-list-*-2026-11-13.jsonl`. The write-up is in `docs/INFORMATION-GAIN-SELECTOR.md`, under "Lists over 120 items: the switch rule".
