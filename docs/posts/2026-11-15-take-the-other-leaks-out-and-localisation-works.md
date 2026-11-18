---
title: "Take the other leaks out of the residual, and leak localisation goes from 15 to 27 of 32"
seo_title: "BattLeDIM leak localisation: a one-leak residual finds 27 of 32 leaks"
date: 2026-11-15
tags: [research, water, leak-detection, digital-twin, BattLeDIM]
description: "On BattLeDIM L-Town, replaying the other leaks out of the residual lifts leak localisation from 15 to 27 of 32 within 300 m. The model was not the limit."
---

Two hours ago, [step 16](/research/water-leaks/) of our leak programme ended
on a hunch. On the BattLeDIM L-Town benchmark, giving a leak localiser the
organisers' exact hydraulic model found no more leaks than the nominal model
(15 of 32 within 300 m). After the run we split the leaks by type and noticed
that the slow, incipient leaks were the ones it missed. By the time a slow leak
is big enough to localise, the network's other leaks have changed by more than
its own flow, so its "residual" is mostly other leaks. We chose that split
after seeing the results, so it was a lead, not a finding. Step 17 tested it.

## Replaying every other leak

BattLeDIM publishes each leak's flow at 5-minute steps. We split every leaky
pipe at its midpoint in the organisers' model (`L-TOWN_Real.inp`) and drew that
flow from the new junction, resetting it before every hydraulic solve. First,
a gate: with every leak replayed, does the model reproduce the published
pressures? It does, to the 0.01 m they are rounded to, with a median
difference of 0.0000 m in all 64 windows. A leak-free run is off by up to 2 m
on the same days.

So the published pressures minus a replay that leaves one leak out is that
leak's own effect and nothing else. That took 128 day-long EPANET runs, under
a minute on four cores.

## The result

Same signatures as step 16, same 300 m rule, plus five predictions written
beforehand:

| localiser, on the one-leak residual | within 300 m |
|---|---|
| organisers' model on the leak's day | **27 of 32** (median error 56 m) |
| nominal model, fixed 5 m³/h | **28 of 32** |
| sensor whose pressure fell most | 20 of 32 |
| organisers' model on step 16's residual | 15 of 32 |

The slow leaks went from **4 of 17 to 14 of 17**. Against step 16, 14 leaks
were gained and 2 lost (sign test, P = 0.004). The best signature now fits
the residual at a median correlation of 0.9986, and the leak pipe's own end
node scores best for 16 of 32 leaks, up from 5. Four predictions held. The
fifth failed: the model beats the most-affected sensor 9 to 2 on discordant
leaks, but that is P = 0.065, not under 0.05.

## What this says

On L-Town, what limits model-based leak localisation is what else is in the
residual. It isn't the hydraulic model: the uncalibrated nominal model does as
well as the exact one once the residual is clean. It isn't the 33 pressure
sensors either. They resolve most leaks to a pipe or two, and only 2 of the 32
have many distant look-alikes.

That turns step 15's reading upside down, and it gives the practical problem
a clear target. A utility doesn't know its other leaks' flows. Its localiser
needs a residual that tracks them anyway, either a baseline that moves with
the network or a localiser that subtracts the modelled effect of leaks it has
already found. Step 17's 27 of 32 is the bar either has to approach.

Every input here is an oracle (the generating model, the leak list, flows and
times) on a simulated network, so 27 of 32 is an upper bound, not a method.
Code, the plan and the per-leak table are in
[`research/water-leaks`](/research/water-leaks/) (step 17).
