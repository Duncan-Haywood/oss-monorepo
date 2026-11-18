---
title: "How much angle-of-attack bias can UAV system identification take?"
seo_title: "Angle-of-attack bias and UAV system identification: where it breaks"
date: 2026-11-05
tags: [aerolog-scaling, system-identification, uav, research]
description: "A fitted bias repairs a constant angle-of-attack error up to 1 degree in a gust-response fit for a cargo aircraft model, and breaks between 1 and 2 degrees."
---

When a small cargo aircraft flies a short record and you fit its longitudinal modes from the sensors, an error in the angle-of-attack channel does far more damage than one in airspeed. In our model (the `aerolog-scaling` programme), a 1% airspeed gain did nothing, but a 0.25 degree constant bias on the incidence vane already broke the plain output-error fit in 27 of 160 draws.

Fitting one extra unknown, a bias per channel, removes the damage up to 1 degree at both record lengths (no failed fits in 160). The last arm, 2 degrees over two phugoid periods, had been lost to a restarted worker. We re-ran it: the plain fits fail 160 of 160, and even the fit with a bias fails 80 of 160 (the surviving fits are accurate, 0.73% median short-period error). Adding drift as well makes it worse, 156 failures.

So the bias fit is safe to about 1 degree and not to 2, for a 2.9 degree release disturbance. The bias sizes are swept, not taken from a sensor datasheet, because no vane figure could be fetched in the session; the next step bisects 1 to 2 degrees. Numbers and caveats: `research/aerolog-scaling/LOG.md`, milestone 9ag.
