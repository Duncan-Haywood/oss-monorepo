---
title: "A solar boat's battery rule against a sun forecast that is wrong by season"
seo_title: "Solar USV battery feedback under a seasonal sun-forecast error"
date: 2026-11-14
tags: [research, marine-hull]
description: "A seasonal sun-forecast error of up to 3% barely dents a solar boat's battery rules: the self-tuning rule wins 93 of 96 cases. The yearly mean error matters."
---

The [last step](2026-11-14-marine-hull-solar-boat-rule-on-unseen-years.md) froze a simulated solar boat's self-tuning battery rule and flew it on ten years of sun it had never seen, 2005 to 2014. Each day the boat divides its recent solar harvest by what its climatology (the average sun for each day of the year) promised, and picks how fast to steer its battery toward a target from that ratio. It held: 48 of 56 cases. But the test made the forecast wrong in one way only, by a single factor all year, from 3% too pessimistic to 3% too optimistic. Real forecast errors change with the season. A cloud regime that the climatology misses in spring need not be missed in autumn.

A trailing ratio should struggle with that. A 90-day window lags a seasonal error by about six weeks, so we expected the shorter windows to do better and the fixed rules, which cannot adapt at all, to do worse.

This step put a seasonal error into the climatology: 1 + A cos(2π(d − φ)/365.25), with an amplitude A of 1, 2 or 3% and the peak on 1 January, 1 April, 2 July or 1 October. Over a year it averages to zero. The data, the 30 ocean points, the 50 W payload, the four packs from 2.5 to 20 kWh and every rule and table were the same as before. Seven predictions went into the experiment file, committed before anything ran. That gives 96 cases, each scored against the plain 7-day rule on distance and on payload hours lost to an empty battery.

What came out:

- **The self-tuning rule held.** With a 90-day window it went at least as far with no more dark hours in 93 of 96 cases. An oracle told the exact bias on every day did 94.
- **Shorter windows did not help.** The 30-day window won 82, the 60-day 89. The ordering from the uniform test stood, against our prediction.
- **The fixed rules did fine too.** The slow fixed rule (feedback over 20 to 30 days) won all 96 cases. In the uniform test it lost all 8 cases at 3% pessimism.
- **The 3 failures** of the 90-day rule were the 10 and 20 kWh packs with the forecast's optimism peaking on 1 January or 1 October. They lost 3 to 14% more payload hours while covering 10 to 15% more distance.

Four of seven predictions held. The three that failed were all predictions that the seasonal error would hurt.

So the useful finding is that the seasonal shape of the error matters little. A battery of a few kWh smooths a swing that averages out over a quarter. What hurt the rules in the earlier tests was the climatology being wrong on average for months at a time. The self-tuning rule is insurance against that mean error, which a designer cannot know in advance. Here it cost almost nothing: 93 cases against the best fixed rule's 96.

For someone writing a solar boat's energy manager: keep the 90-day harvest-over-forecast ratio. There is no reason in this sweep to shorten it to chase seasonal error.

Limits: the seasonal error is one cosine with the same calendar phase at every point, so it is optimistic in the southern summer wherever it is optimistic in the northern winter. The yearly mean error is held at zero, so a mean error plus a seasonal swing is untested, and that is next, along with a seasonal error read from the data rather than assumed. This is a simulation only: calm water, daily steps, NASA POWER sunlight on a 0.5 by 0.625 degree grid, one 4 m boat starting each year with a full pack. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zy).
