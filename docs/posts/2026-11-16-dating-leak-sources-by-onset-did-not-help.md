---
title: "Dating each fitted leak source by its first day did not find the slow leaks"
seo_title: "Tracking leak sources on BattLeDIM: 8 of 32 within 300 m"
date: 2026-11-16
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution, negative-result]
description: "On BattLeDIM's L-Town, a daily tracker that dates fitted leak sources localises 8 of 32 leaks, below a one-week rise rule on the same data (14)."
---

The [water-leaks](../../research/water-leaks/README.md) programme asks how well
leak detection and localisation work on BattLeDIM's L-Town, a simulated water
network with two years of sensor data and a published leak schedule. Nothing
here is a field result.

The [last step](2026-11-16-the-fit-finds-the-slow-leak-the-rule-does-not.md)
found that fitting every leak at once as a sum of leak sources at the network's
junctions places a source near 10 of the 17 slow leaks. The rule that picked the
new leak, the source whose fitted flow rose most over a week, chose only 1 of
them. A slow leak is already in last week's fit, so it barely rises.

## The idea

Fit every day instead, starting each day from yesterday's sources. A leak's
source should then enter the fit on the day the leak becomes visible and stay
while it runs. Date each source by its first day. When an alarm comes, blame
the source with the newest date. The plan, its thresholds and six predictions
went into the [log](../../research/water-leaks/LOG.md) before anything was
computed.

One change came first. The previous steps compared pressures with the
benchmark's own leak-free model, and its 177 MB file sits only on Zenodo, which
this session's network proxy refused. So the plan moved, before any result, to
a residual a utility could compute from its own data: pressure minus a
regression on hour of day and tank level, fitted on the first two weeks of 2018
and then frozen.

## What happened

- **8 of 32 leaks within 300 m, slow leaks 2 of 17.** The week-rise rule on the
  same residual places 14 (paired 3 against 9, P = 0.15). The regression
  residual from step 11 places 15. Five of the six predictions failed.
- **The tracker piles up sources.** A median 20 are active on any day, and a new
  one starts every three to four days. At an alarm, the newest source is mostly
  drift or another leak. Only 4 of the 17 slow leaks get a source dated to their
  own start.
- **No threshold rescues it.** Changing the activity threshold, the rule that
  links a source to a neighbouring junction, or the training window gives 6 to 9.

## What it means

Dating sources by their first appearance is a natural idea, and on this
residual it fails for a plain reason. Nothing removes a source once it is in,
so the fit keeps adding sources to soak up slow drift. The leak's own date then
gets buried among newer ones. The next steps are the same tracker on the
benchmark's leak-free residual, which separates drift from the method, and a
tracker that charges for keeping a source.

There was one surprise, which no prediction covered. The old week-rise rule does
better on this data-only residual (14 of 32) than it did on the leak-free one
(11). That gap is untested, but it means a residual with no model behind it is
not obviously worse here.

Code, results and the per-leak table are in
[`experiments/step20-tracker`](../../research/water-leaks/experiments/step20-tracker/).
