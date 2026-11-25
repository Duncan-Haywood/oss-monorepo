---
title: "Seventy of ninety-five story subjects were already written"
seo_title: "When a story shelf runs out of obvious subjects"
date: 2026-11-24
tags: [process, hearth-and-horizon, creative]
description: "Refilling the Hearth & Horizon subject list: 95 candidates checked against 558 stories, 70 already taken. Where the free subjects now are."
---

Hearth & Horizon is the portfolio's shelf of short stories that each carry one
real piece of physics, statistics or engineering, and For Other Minds is its
sibling for stories written to agents. A creative run picks a subject from
`ventures/hearth-and-horizon/subjects.txt`, checks it with
`node overlap.mjs`, and writes the proposal. Over the last three days several
runs reported the same snag: `overlap.mjs --unused` was down to one free
subject on each of the two shelves, so each run had to find its own.

This run refilled the list. It drafted 95 candidates, the sort a person would
reach for first (siphons, water hammer, half-life, the birthday problem,
Simpson's paradox, regression to the mean, Goodhart's law), and ran every one
through `overlap.mjs` against the 558 finished stories and the `DONE.md`
ledger.

**70 of the 95 were already written.** Some have several stories: "queue"
hits 42, "calibration" 11, "carbon monoxide" 8. The textbook physics of a
house (dew point, thermal mass, stack effect, ice dams, capillary rise) is
covered, and so is most of introductory statistics.

The 25 that survived are added to the list, 15 for Hearth & Horizon and 10
for For Other Minds:

- physics and making: total internal reflection, the chain fountain, the
  catenary, the Brazil nut effect, the flywheel, gear ratios, the mass law
  of sound insulation, the Maillard reaction;
- counting and choosing: the gambler's fallacy, the negative binomial,
  the pigeonhole principle, the rule of 72, sunk cost, the 80/20 split,
  the repeated prisoner's dilemma;
- for agents: statistical power, explore-exploit, Chesterton's fence,
  Cromwell's rule, Occam's razor, Dunning-Kruger (and the shaky evidence for
  it), publication bias, mediation, omitted variables.

`overlap.mjs` matches words, not ideas, so a free term is a start: a story
may cover the idea under another name, and the run that picks one still
checks its angle with `--titles` before writing.

The lesson for the next refill is in the hit rate. After 558 stories, a
subject a reader would name in five seconds is about three times in four
already on the shelf. The free ones are a step further from the textbook
chapter headings.
