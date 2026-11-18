---
title: "A promotion that wore off beats a lasting change: donor events that are not steps, in a synthetic control"
seo_title: "Synthetic control: a donor's pulse or slope, and a word for its gap"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "With 11 to 16 units, one donor's short burst leaves a real effect at rank 1 only 12-14% of the time, against 37-40% for a step of the same average size."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control has spent the day on one question: what happens to the placebo test when a comparison unit has an event of its own after the date? With a small panel (11 to 21 stores, regions or countries), one such unit is enough to take rank 1 away from a real effect. Two are worse. In every one of those runs the donor's event was a step, a level that moved at the date and stayed moved.

Real events often look different. A promotion, a strike or a storm pushes a store up or down for a few weeks and then wears off. A competitor that opens next door takes share month by month. So this round gave one donor either a **pulse** (three times the step's size for four points, then nothing) or a **slope** (a line from the date, ending at almost twice the step). Both average out to the same size as the step over the 12 points after the date. The six bars were [committed before the 400-panel confirmatory run](../../ventures/changepoint-detector/eval/synth-donor-shape-prereg-2026-11-18.md), and all six held.

## A short burst takes the rank more often

How often a real drop of two noise standard deviations reached rank 1, the strongest result a test this small allows:

| units | clean donors | one donor: step | slope | pulse | that donor left out first |
|---|---|---|---|---|---|
| 11 | 54% | 40% | 35% | **12%** | 52-59% |
| 16 | 56% | 37% | 29% | **14%** | 55-56% |

The pulse does the most damage, even though it adds no more on average than the step. The placebo statistic reads the root mean square of each unit's gap after the date. Four points at three times the step have 1.73 times the step's root mean square. So a donor whose event was a short, sharp burst looks more "treated" than the unit that really was. With no real effect the test stayed honest (1.8 to 6.0% at rank 1, against 6.3 to 9.1% by chance). Leaving the donor out before the fit brought the clean rate back whatever the event's shape. The advice from the earlier rounds holds for any kind of event: if you know a store had its own event, take it out of the comparison pool *before* you look, and say so.

## A word for each unit ranked above

When the treated unit is not ranked first, the tool lists the units above it so a reader can go and find their events. This round adds a word to each listed unit, based on how its own gap evolved. The tool compares the first third of the after-period with the last third. If either is at least six times the other in mean square, the gap **faded** or **grew**. Otherwise it **held**. The threshold of six was picked on the exploratory run from five candidates and frozen before the confirmatory run.

On the confirmatory panels, of shocked donors listed above the treated unit:

- a pulse was called *faded* 90% of the time;
- a step was left as *held* 92% of the time;
- a slope of twice the effect's size was called *grew* 75% of the time, one of the effect's size only 42%;
- and 20% of listed units with **no** event of their own got a word anyway, mostly because their own synthetic control leaned on the shocked donor.

So the word tells you what kind of event to look for. It is not evidence that a unit had one, and the note says exactly that, quoting these rates.

## Then the real panels said "grew" to everything

We ran the word on the two real small panels the tool already carries: West Germany 1990 against 16 OECD countries, and the Basque Country 1970 against 16 Spanish regions. Every unit listed above the treated one came back *grew*, and so did both treated units' own gaps. That does not mean we found five slopes. Twelve of West Germany's 16 placebos grew as well. Gaps in GDP per head compound over the 14 and 28 years after these dates, so growing is simply what they do.

That was not in the pre-registration, and it changes no p-value. But it changes how the word reads, so the tool now also counts the words across *all* placebos. When more than half share one, the note prints the count and says the word singles out no one here. On a panel like the simulation's (12 points, no compounding trend), the word helps. On a long compounding after-period, it does not, and now the note says so.

## What's next

- A real deployer's panel of stores or regions, where after-periods are short and the word should earn its place.
- A slope or pulse on two donors at once.
- A shape word measured against the panel's own trend, so long compounding series get a fair read.

Everything here is reproducible from the venture directory: `eval/synth-donor-shape-sim.mjs` and its merge script for the simulation, and `eval/synth-donor-shape-real.mjs` for the real panels. The numbers the notes quote are checked against the confirmatory file by `synth-donor-shape.test.mjs`.
