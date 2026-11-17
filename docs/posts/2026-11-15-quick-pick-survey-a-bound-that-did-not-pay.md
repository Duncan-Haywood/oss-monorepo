---
title: "A bound that did not pay: when a safer careless-answer rule ranks no better"
seo_title: "Careless survey respondents: a bounded test vs a split search"
date: 2026-11-15
description: "A test with a bounded false-alarm rate made 3 to 35 times fewer wrong calls on careless survey respondents, ranked no better, and so did not ship."
tags: [quick-pick-survey, pairwise-comparison, survey-quality, changepoint, simulation, product]
---

[Quick Pick Survey](https://marisstella.app/quick-pick-survey/) ranks a list
by asking people to pick between two options at a time. Some respondents get
bored. They speed up, answer at random for a while, and then click the same
place on the screen every time. The ranking already catches the clicking
stretch. Since yesterday it also moves the cut back to the point where they
first sped up, so their random answers are left out too.

To find that point, the code looks for the split in a person's answer times
that best separates a slow stretch from a fast one. Someone whose pace simply
drifts, who is slower one minute and quicker the next for no reason, always
has a "best split". So the search can point to a speed-up that never happened.
Nobody new gets flagged this way, because the rule only moves the cut for
people the clicking test has already caught. But it can cut some of their
honest answers.

## The fix we tried

We tested one thing at a time instead of searching freely. We already know
where the clicking starts, so we model the person's pace as a slow random
drift with a step at that point. Then we ask whether one more step, earlier
on, explains their times well enough. That evidence has to clear a bar
adjusted for the number of places we looked.

The first version did not hold its bound. It estimated how much each person's
own pace drifts, and adding a step let that estimate shrink, so a wobble
looked like a speed-up: 3.25% of made-up cases moved where the target was 1%.
Fixing the drift at the no-step estimate held the bound but missed real
speed-ups, because a person's own drift estimate grows to absorb the step.
The version that worked takes the drift from everyone else on the panel. On
a pure drift it moved 0 to 0.5% of made-up cases.

## What the simulations said

We ran 176 simulated settings: panels of 20, a quarter or 40% careless, paces
that drift by different amounts. In each one we gave every honest respondent
a made-up clicking run and counted how often each rule moved its cut.

- Where paces drift, the existing search moved 11 to 32% of those made-up
  runs. The bounded test moved 0.9 to 3.2%.
- Where nobody drifts, the search moved none, and the bounded test moved 0.6%.

But what we sell is the ranking, and there the bounded test did not win. Set
strictly, it kept half of the small gain the search gives (+0.0002 against
+0.0004 in rank correlation with the truth). Set looser, it matched the gain
on one set of seeds and fell a little short on another, with one setting
significantly worse.

So the search stays the default. The bounded test is in the code, with its
tests, for the first real survey. If real people's paces drift more than our
simulations assume, the search's wrong calls will grow and the bounded
test's will not, and comparing the two on real answer times will show it.

The full write-up, with every table and the raw rows, is in the project's
[selector notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md).
