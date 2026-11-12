---
title: "Switching a survey's default question order, after checking what it costs"
seo_title: "Adaptive pairwise survey: the information-gain order as default"
date: 2026-11-12
description: "The question order that can name your favourite is now the default up to 120 options. Careless-respondent sims under both orders found one cost."
tags: [quick-pick-survey, surveys, ranking, statistics, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
people two options at a time. Which two it shows next is the "question order".
There have been two: **standard**, which spreads answers evenly across the
list, and **staged**, which picks the pair whose answer is expected to teach
the model the most. Usually that means two options the person's answers so
far rate close together.

Earlier today we replayed both on real people's published rankings. Staged
let the results card name a person's single favourite for 35-100% of people
at about 8 answers per option. Standard managed 0.5-5.5%. Staged still wasn't
the default, though. A survey only got it if its owner opened a menu and
picked it.

Changing a default changes every survey whose owner never chose, so we
checked the cost first. Our three simulations of careless respondents had
only ever run under staged. Each one now takes a `--selector` flag, and we
ran all three under both orders on the same seeds (284 cells, raw rows in the
repo).

## What we found

- **Honest panels:** staged's pooled ranking is equal or slightly better
  (Spearman 0.940-0.970 against 0.938-0.966).
- **People who always click the same screen slot:** staged is better, by up
  to 0.025. These people are already left out of the pooled ranking either
  way.
- **A real minority with its own taste:** no difference that matters
  (-0.010 to +0.012).
- **Respondents who pick by something unrelated to the question,** such as a
  familiar name: under staged the pool leans 0.01-0.03 further toward that
  trait. That's small next to the damage the pattern does under either order
  (+0.26 to +0.68).
- **Answer times** separate careless from honest people just as well under
  staged.
- **On the real ranking panels,** staged's pooled order matched people who
  were never asked at least as well as standard's in 22 of 25 cells, and was
  never more than 0.01 behind.

**One cost survived.** Take a panel where 40-50% of people flip a coin on
every single answer. There, staged's pooled ranking is 0.006-0.025 Spearman
lower. Staged asks close pairs on purpose, and a random answer on a close
pair moves the ratings more than a random answer on an easy one. The
defences still work under staged. Leaving those people out recovers more
than it does under standard, and the agreement check spots them just as
well (AUC 0.96-1.00). The cost is still real, and fixing it without also
penalising genuine minorities is now first on the list.

## What changed

Staged is now the default for lists of up to 120 options. A survey's own
setting still wins, then the deployment's `PAIR_SELECTOR` variable. An
unknown value is ignored with a log line instead of being quietly treated as
one of the two. Longer lists keep standard for now, because staged's
behaviour above 120 options hasn't been measured against it. That's the next
measurement.

Everything here comes from simulation plus a replay of two published ranking
panels. No real survey answers yet. Full tables:
[INFORMATION-GAIN-SELECTOR.md, "Staged as the default up to 120 items"](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md).
