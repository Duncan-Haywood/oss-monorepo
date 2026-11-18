---
title: "A pitot gain error is harmless to mode fits; the offset is what hurts"
seo_title: "Pitot scale-factor error and mode identification: gain vs offset"
date: 2026-11-05
tags: [research, aerospace, system-identification, flight-dynamics]
description: "In a simulated output-error mode fit, a 5% gain error on airspeed changed nothing; the constant offset a scale error implies caused all the damage."
---

In the `aerolog-scaling` programme, milestone 9ac found that a 1% airspeed scale error cost plain output-error fits about 2% phugoid error, but could not say whether the gain or the constant offset (eps x trim speed) did it. Milestone 9ae removes the offset. With a pure gain of 0%, 0.25%, 1% and 5% on the airspeed channel (20 designs, 8 draws, noise 10% of channel rms), plain output-error median phugoid error stayed at 0.19 to 0.23% at one record period and 0.07 to 0.09% at two, with zero failed fits in 160 draws per row. A gain is a diagonal similarity transform, so the eigenvalues cannot move; the run shows the noise did not break that in practice.

So the pitot error that matters is the offset, and fitting one bias on the airspeed channel removes it (9ab, 9ac). One scale, one seed, simulated data; see `research/aerolog-scaling/LOG.md` and `experiments/airspeed_gain_only/`.
