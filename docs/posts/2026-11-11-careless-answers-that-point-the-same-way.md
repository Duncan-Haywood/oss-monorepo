---
title: "Careless answers that point the same way: which survey clickers actually move a ranking"
seo_title: "Careless respondents in pairwise surveys: which ones bias the ranking"
date: 2026-11-11
tags: [quick-pick-survey, pairwise-comparison, survey-quality, careless-responding, simulation, open-source]
description: "Four kinds of careless survey respondent, simulated: coin-flippers and favourites barely matter; people who pick by one shared wrong reason skew the ranking."
---

[Quick pick](../../ventures/quick-pick-survey/README.md) is an open-source
survey that ranks a list by asking people to choose between two options at a
time, then pools everyone's answers into one ranking with honest ranges. Earlier
runs showed the pool shrugs off people who answer at random *some* of the
time. A careless person's ratings come out as a squashed, noisier copy of
their real preferences, and averaged with everyone else that copy still helps
a little.

This run tested careless patterns that are not random. Everything below is
simulated, not real respondents. The script is
`scripts/careless-pattern-sweep.ts` and every number is in
`docs/INFORMATION-GAIN-SELECTOR.md`, section "Careless patterns that are not
random".

## Four ways to not read the question

Each simulated survey has a shared truth per option, and each respondent's
taste is that truth plus a personal twist. Then a share of the panel (10% to
50%) answers by one pattern for the whole session:

- **Coin flip** on every pair.
- **First slot**: always the top option. The app shuffles which option goes on
  top, so this carries no information about the options.
- **Favourite**: one pet option of their own, picked whenever it appears.
- **Salience**: picking by a trait that has nothing to do with the question
  (the familiar name, the short label) and is the *same* for every careless
  person.

A fifth group is the control: a camp with a genuinely different taste,
answering honestly.

## What moved the ranking

On 20-person panels (Spearman correlation of the pooled ranking with the
truth; 1.0 is perfect):

| who is careless | shipped ranking | if you could drop exactly them |
|---|---|---|
| nobody | 0.96-0.97 | (nothing to drop) |
| half pick a favourite | 0.962 | slightly worse |
| half click the top slot | 0.924 | +0.025 |
| half flip coins | 0.886 | +0.05 to +0.08 |
| a quarter pick by salience | 0.902 | +0.05 to +0.07 |
| 40% pick by salience | 0.773 | +0.17 to +0.20 |

Favourites cancel out: everyone's pet option is different. Coin flippers and
slot clickers add noise. Salience is the dangerous one, because it adds a
*direction*. With 40% of the panel picking by it, the pooled ranking
correlates 0.51 with the irrelevant trait, and 4% of the pairs the report
calls clearly ordered are the wrong way round. Every other pattern kept that
under 1.5%. More respondents do not fix it: at 60 people with 40% picking by
salience, 8.9% of the "clear" pairs are wrong, because a bigger panel narrows
the ranges around the same bias. A ranking that is wrong but sure of itself is
the worst kind.

## Two defences, and the one we did not ship

**Leaving out slot clickers.** The selector already watched each person's
share of top-slot picks. At 70% or more either way over 30 or more answers, it
switches to a safer way of picking pairs. Applying the same rule to the pooled
ranking caught every slot clicker and recovered everything they cost. It
flagged 0.3-0.7% of honest people at 60 answers and never touched the
different-taste camp. That one is now live: the ranking leaves those
respondents out and says how many.

**Agreement weighting.** Score each respondent by how well their order matches
everyone else's, then count low scorers for less. Against careless minorities
it recovered much of the loss: about 60-90% of what dropping exactly the
careless would give for coin flippers and slot clickers, and 45-80% for
salience. It cost honest panels nothing. But it also quieted the
different-taste camp, by 0.01 to 0.03 against the whole panel's average taste.
That was significant in 36 of 48 settings. When half the panel picked by
salience it made things worse, because the careless block *was* the
consensus. From the answers alone, a careless block and a real minority look
the same.

So agreement ships as a **note, not a weight**. When some respondents' order
barely matches everyone else's, the survey owner is told how many. The note
says that this is what careless clicking looks like and that a genuinely
different taste looks the same, and the ranking keeps counting them. Deciding
which minority to ignore is a judgement about people, and the owner should
make it, not a formula.

## A correction found on the way

The simulator's old position-bias setting gave the bias to whichever option
the pair picker chose first, without the shuffle the live app does. That
overstated the harm a lot. For the information-based picker at 30 options and
300 answers: 0.351 unshuffled, 0.611 shuffled. The safety switch that bias
motivated still pays with the shuffle, so it stays. The old numbers now carry
a correction in the docs.

## Limits

These are simulated people with one irrelevant trait as strong as real taste,
lists of 15 to 30 options and panels of 8 to 60. If the careless are the
majority, no statistic on the answers can say which view is the careless one.
That needs evidence from outside the answers, such as timing or attention
checks, and none was tested here.
