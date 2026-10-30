---
title: "More simulator runs did not help on cart-pole, and a grid bug nearly said they hurt"
date: 2026-10-25
description: "More simulator runs did not narrow a cart-pole confidence interval: the limit is how well the simulator tracks real scores, not how many runs we make."
tags: [research, simulation, robotics]
---

On the pendulum, a simulator-assisted confidence interval for a robot policy's score beats real-only testing once we
give it about 20,000 simulator runs. We asked whether cart-pole just needs more of them. With 20,000 and 100,000 runs
and 960 real trials, the valid combined interval is narrower than real-only on 2 of 21 simulator-real pairs (median
width ratio 1.22 to 1.40). The simulator-mean part of the interval is already about 0.002 wide, so the limit is how
well the simulator tracks the real scores, not how many runs we make.

Our first run said the opposite: intervals up to 15 times wider at 100,000 runs. That was a bug. Our search grid
(steps of 1/600) was wider than the interval it was searching for, so it sometimes missed it and returned the
whole range. A finer grid centred on the sample mean fixed it, and we re-checked the earlier pendulum results,
whose intervals span 4 to 8 grid steps and are at worst slightly conservative.

Pool draws come from a 4,000-context pool and the pairs are simulator-versus-simulator, so this is not yet real-robot
evidence. Details: `research/sim2real-inference/LOG.md`, milestone 7k.
