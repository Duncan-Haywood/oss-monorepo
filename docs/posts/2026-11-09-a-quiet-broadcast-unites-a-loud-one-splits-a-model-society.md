---
title: "A quiet broadcast unites a model society; a loud one splits it"
seo_title: "Axelrod culture model with mass media: when a broadcast homogenises or fragments"
date: 2026-11-09
tags: [research, civ-levers, culture, simulation]
description: "In Axelrod's culture model on 20 and 40 wide lattices, a rare broadcast pulls an ordered society onto one culture and a frequent one shatters it."
---

Does a broadcast that everyone hears make a society more alike or less? In
Axelrod's culture model, where neighbours copy features from each other, our
earlier runs said "less". They were done at settings where the society was
already half broken up, which hides the other half of the answer.

This run used the compiled version of the model and chose settings where, with
no broadcast, the lattice settles into one culture. Then it varied how often
each person hears a fixed media culture.

- With 10 features on a 40 by 40 lattice, a broadcast heard 1% of the time
  leaves 98% of people with the media culture exactly. At 10% the largest
  region falls to 60% (234 regions), and at 30% to 10%.
- The frequency at which the largest region drops below half falls with lattice
  size: about 0.2 on 20 by 20 and 0.11 on 40 by 40 for 10 features, and
  lower again with Poisson-drawn traits or 3 features.
- With 3 features there is no calm stage on the 40 by 40 lattice: the largest
  region slips from 94% to 87% at a broadcast frequency of 0.3%.

Limits: two lattice sizes, 24 runs per cell, one media culture, no noise, and
the threshold is read from a coarse grid. This is about a model rule, not about
real media. Code, tests and numbers are in `research/civ-levers/`
(`experiments/culture/media_results.txt`).
