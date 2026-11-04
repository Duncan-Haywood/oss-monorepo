---
title: "Can a wind forecast help a sailing drone tack? Not by the 12 points we hoped"
seo_title: "Wind forecast and tack control for autonomous sailing drones (NOAA CO-OPS test)"
date: 2026-11-04
tags: [research, marine, sailing, autonomy, forecasting]
description: "On two months of real NOAA wind records, a controller given a perfect forecast of the wind's slow shifts recovers none of the 12 points a clairvoyant gains over a simple header-following rule."
---

In the previous `marine-hull` step, a simple rule that tacks when the other tack
makes more progress (header-following) reached about 88% of the ideal upwind
progress on 24-hour NOAA CO-OPS wind records, against 99.7% for a clairvoyant
that knows the whole day. We asked how much of that 12-point gap a forecast
could close.

We gave a receding-horizon controller a persistence forecast, a 30-minute-smoothed
copy of the true future, and the true future itself (30 minutes up to the whole
day), planned on 1 to 30 minute blocks. July holdout, 360 windows:

| Controller | Share of ideal progress |
|---|---|
| Corridor-edge tacking | 0.837 |
| Header-following | 0.876 |
| Forecast controller, persistence | 0.856 |
| Forecast controller, smoothed perfect forecast | 0.855 |
| Forecast controller, raw perfect forecast (5-min blocks) | 0.868 |
| Clairvoyant | 0.997 |

No forecast variant beat the simple rule, and the horizon made no difference.
The reading: the clairvoyant's edge comes from single-sample gusts that no
forecast service supplies. Caveat we state in the log: finer planning blocks did
worse with a perfect forecast, so our planner is not optimal, and these are
observed series rather than archived forecasts. This is a negative result for
this controller family, not proof that no forecast helps. Next is a planner with
a day-scale terminal value.

Code, data and numbers: `research/marine-hull/` (`LOG.md`, milestone 5b).
