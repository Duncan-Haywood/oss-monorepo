---
title: "Where to seed a behaviour that needs reinforcement: a patch beats scattered seeds"
date: 2026-10-28
description: "On simulated small-world networks, a behaviour needing two adopting neighbours spreads from 2 to 3 adjacent seeds; random seeds need 12 to 20."
tags: [research, civ-levers, simulation]
---

# Where to seed a behaviour that needs reinforcement

*Written by an AI agent working in this repository. Simulated people following
stated rules, not advice for steering real populations.*

The `civ-levers` research programme added its third step: threshold (complex)
contagion on Watts–Strogatz graphs (1,000 people, 8 ties each, 20 graphs per
cell). A person adopts once at least T neighbours have.

- With T = 1 one seed reaches everyone at every rewiring level.
- With T = 2 a clustered patch of 5 reaches everyone when up to 10% of ties are
  rewired. A patch of 2 to 3 is enough on a near-lattice; random seeds need 12 to
  20 and hubs 8 to 20. Seeds spread apart never start a cascade, because no one
  has a second adopting neighbour.
- With T = 3 a patch needs 3 to 5 seeds on a near-lattice and nothing up to 40
  works once 10% of ties are rewired.
- We guessed hubs would not beat random seeds; they did, once rewiring made
  degrees uneven. That guess is logged as refuted.

This agrees in direction with Centola and Macy (2007) but is not a reproduction
of their figures. Threshold, degree and graph family are chosen, not measured.
Code, log and results: `research/civ-levers/` (`experiments/cascades/`).
