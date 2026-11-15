---
title: "Give a leak localiser a perfect residual and it finds one more leak"
seo_title: "BattLeDIM leak localisation: residual or hydraulic model to blame?"
date: 2026-11-15
tags: [research, water, leak-detection, digital-twin, BattLeDIM]
description: "On BattLeDIM L-Town, the exact leak residual lifts a nominal-model localiser from 15 to 16 of 32 leaks within 300 m; the model, not the residual, is the limit."
---

Leak localisation in a water network usually has two parts. First you estimate
how much each pressure sensor has dropped because of the leak: the residual.
Then you match that pattern of drops against a hydraulic model's prediction for
a leak at each junction. When the method misses, you can't easily tell which
half failed.

On the BattLeDIM L-Town benchmark we can tell. Yesterday's
[step 14](/research/water-leaks/) found that the published
pressure data are exactly the organisers' own network model plus the leaks,
rounded to 0.01 m, with no sensor noise. If you subtract a leak-free simulation
of that model from the published data, what remains is the true effect of the
leaks. Take it against each leak's level just before onset, and you have the
best residual any detector could ever build.

## What a perfect residual buys

We reran the localiser from step 11 on that residual. It uses the same 782
junctions, the same nominal model and the same 300 m rule BattLeDIM scores
with, applied to the same 32 leaks:

- the regression residual from step 11: **15 of 32** leaks placed within 300 m;
- the perfect residual: **16 of 32** (paired sign test P = 1.0);
- naming the sensor whose pressure fell most, on the perfect residual: 14
  (model against sensor, P = 0.73).

Random guessing would place about 1.4 of the 32. The model's best signature
correlates with the true leak effect at a median of 0.97, yet it still misses
half the leaks. Junctions hundreds of metres apart produce almost the same
pattern across 33 sensors, so a good fit in shape doesn't pin down the place.
Giving the localiser each leak's true size didn't help either (15 of 32).

One more number: if you skip the pre-onset baseline and use the leak effect
as it stands, only 2 of 32 land within 300 m, which is no better than chance.
Up to 23 leaks overlap in 2019, so each new leak has to be measured against
its own before-state.

## Detection is the other way round

The same residual says when each leak first shows up. We counted a leak as
visible from the first hour at which some sensor sat 0.05 m below its
pre-onset level for three hours running. By that test, every one of the 32
leaks was visible within a median of 0 hours of onset, and none took more
than 20 hours. The pressure CUSUM's alarms came a median of 104 hours after
onset, and LILA's a median of 138 hours. Every alarm came after its leak was
already visible.

So on L-Town the two halves fail in opposite places. Localisation is limited
by the hydraulic model, because a better residual hardly helps. Detection
delay is limited by the residual, because the leak is in the data within
hours and the detectors take four to six days to notice. All four predictions
we wrote down before the run held.

These are oracle bounds. They use the leak list and the generator's own
model, which no real utility has, and L-Town is a simulated network. The next
step localises with signatures from the generator's model itself. That will
show how much of the remaining error comes from the mismatch between the
nominal and real models, and how much comes from what 33 sensors can't see.

Code, data checksums and the plan written before the run are in
[`research/water-leaks`](/research/water-leaks/) (step 15).
