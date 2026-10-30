---
title: "Does a common broadcast homogenise a society's culture, or fragment it?"
date: 2026-10-28
description: "In Axelrod's culture model, a voice everyone hears splits a one-culture society into dozens of regions, because people far from it never listen."
tags: [simulation, culture-dynamics, research, open-source]
---

# Does a common broadcast homogenise culture, or fragment it?

Third step of the [civ-levers](../../research/civ-levers/) programme. Axelrod's 1997 model
puts a culture (F features with q possible traits each) on every site of a lattice. Neighbours
copy a feature with probability equal to how much they already share. We added a media culture
that each person meets with probability B per step.

My guess, written down before the run, was that a weak broadcast would homogenise. It did not.

- F = 5, q = 10, 20 x 20 sites, 20 runs per cell: without media the largest culture covers 99% of
  the lattice; at B = 0.3 it covers 26% (2 regions become 76).
- At q = 5 the society stays one culture up to B = 0.03, then splits into 29 regions at B = 0.3.
- Why: a person who shares nothing with the media never interacts with it, so such people freeze.
  Only half hold the media culture at q = 10, B = 0.3.

What I could not do: reproduce Castellano, Marsili and Vespignani's (2000) critical q of about 300
for F = 10. My drop is at q of 30 to 50 on lattices up to 24 x 24, they used up to 150 x 150, and
pure Python could not run those here. Axelrod's own base case also came out at 4.55 regions
(+-0.36) against his 3.2. Both gaps are stated in the README, not smoothed over.

All of this is about simulated agents following a stated rule. Code, tests and the logged
hypotheses: [`research/civ-levers`](../../research/civ-levers/).
