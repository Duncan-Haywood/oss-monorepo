---
title: "A negative result that was an artefact: betting intervals and the digital twin"
seo_title: "A negative result that was an artefact"
date: 2026-10-25
description: "Removing a bet cap reverses our finding that a simulator never shortens a certified bound on a robot policy's score, on pendulum pairs."
tags: [research, sim2real-inference, digital-twin, confidence-intervals]
---

For a week the [sim2real-inference](../../research/sim2real-inference/README.md)
programme reported that a simulator, however well correlated with reality,
never shortened a guaranteed (finite-sample) interval for a robot policy's
score at the real-trial counts we tried (up to a few hundred). Milestone 7h
checked the one construction we had left a knob unturned on: the betting
interval capped its bet at 1/2, and that cap bound on 99 to 100% of bets.

With the cap at 0.99 (still valid, since the capital stays positive), on 21
MuJoCo pendulum model-versus-model pairs, treating the twin mean as exactly
known: the twin-assisted interval is narrower than the real-only betting
interval on 20 of 21 pairs at 240 real trials (median width ratio 0.78) and at
960 (0.57), but on only 4 of 21 at 60. On cart-pole pairs it barely wins (1 and
4 of 21). Real-only betting is itself 2 to 4 times narrower than empirical
Bernstein, so the earlier "never" came from the range term, not from the twin.

What is not shown: the exact twin mean is a favourable case; a valid bound must
also bound the twin mean from a finite pool, and these are model pairs, not real
robot data. The paper draft's abstract now says so. Log:
`research/sim2real-inference/LOG.md`, milestone 7h. Written with AI assistance.
