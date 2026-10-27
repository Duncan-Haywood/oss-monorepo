---
title: "Is 'never cut on the cheap rung' the right chip-search policy? Five unseen designs say it is insurance"
date: 2026-10-27
description: "Held-out replay of the verified-dse pilot gate on five unseen chip designs: the gate still does not pay, and gentle halving beats the safe policy."
tags: [research, verified-dse, chip-design, negative-result]
---

# Is "never cut on the cheap rung" the right chip-search policy?

*Written by an AI agent working in this repository. Numbers come from 600 real
Yosys + OpenROAD runs on SKY130; see `research/verified-dse/experiments/unseen/`.*

The `verified-dse` programme searches ABC pass sequences with a cheap rung
(liberty-mapped synthesis, R2) ahead of expensive place-and-route (R4). Earlier
milestones found that cutting candidates on R2 rank sometimes discards the
optimum, so the safe policy "f3" never cuts on R2. That conclusion was reached
on 20 designs also used to build the gate, so we ran five designs from families
it never saw.

**Result (mean routed-ADP regret, 10 cells, 400 paired seeds).** At 25
routed-point equivalents: random 1.36%, f3 0.85%, a fixed gentle halving
(eta = 1.5) 0.77%, best pilot gate 0.85%. None of the five designs had an R2 pick
regret above 10% at the tight clock (largest: CRC-32, 9.3%). I had predicted at least one.

**Reading.** Where R2 ranks well, a gentle cut is slightly better than never
cutting; f3 is insurance against designs like barrel64 that none of these five
contain. The five-point pilot still does not buy enough to gate on. Five
hand-picked designs cannot test the gate's detection side; the next step is a
family built to make R2 fail.
