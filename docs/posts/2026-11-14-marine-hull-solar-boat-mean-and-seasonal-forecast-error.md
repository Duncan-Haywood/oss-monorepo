---
title: "A solar boat's battery rule against a sun forecast wrong on average and by season"
seo_title: "Solar USV battery rule under mean plus seasonal sun-forecast error"
date: 2026-11-14
tags: [research, marine-hull]
description: "A solar boat's self-tuning battery rule wins 104 of 128 under a mean plus seasonal sun-forecast error; real seasonal error is 2%, 5 to 8% past 50 degrees."
---

The [last step](2026-11-14-marine-hull-solar-boat-seasonal-forecast-error.md) tested a simulated solar boat's self-tuning battery rule against a sun forecast that was wrong by season but right on average. The rule barely noticed. The conclusion was that the mean error is what hurts. That left two open questions. What happens when the forecast is wrong both ways at once? And how big is a real forecast's seasonal error anyway, rather than an assumed cosine?

The rule works like this. Each day the boat divides its last 90 days of solar harvest by what its climatology (the average sun for each day of the year) promised for those days. From that ratio it picks how fast to steer its battery toward a target: slowly if the climatology looks pessimistic, quickly if it looks optimistic. Everything about the rule was frozen several steps ago.

**The sweep.** The same ten years of NASA POWER sun (2005 to 2014) at 30 ocean points, the same 50 W payload and the same four packs from 2.5 to 20 kWh. The climatology, built from 2015 to 2024, was multiplied by a mean bias of 0.97, 0.98, 1.02 or 1.03 and then by a 3% seasonal swing peaking in any of the four quarters. That makes 128 cases. Each was scored against a plain 7-day trailing-mean rule on distance and on hours the payload goes dark. Nine predictions were committed before anything ran.

- **The self-tuning rule held.** It went at least as far with no more dark hours in 104 of 128 cases. With the mean bias alone it won the equivalent of 108. The seasonal swing on top cost it at most 2 cases in 32 at any mean bias.
- **Fixed rules depend on the sign of the mean.** The best fixed rule won 30 and 32 of 32 when the forecast was pessimistic, and 2 and 1 of 32 when it was optimistic. The slow fixed rule did the reverse at the pessimistic end, winning 4 of 32 at 0.97.
- **Knowing the season is worth something.** An oracle told the exact bias on every day won 120 of 128, 16 more than the self-tuning rule. With no seasonal swing the oracle did worse than the rule. The gap is the value of knowing when in the year the forecast is wrong.
- **The rule's failures are the familiar ones.** The smallest pack under a pessimistic forecast saves sun it never uses and falls 0.4 to 4.5% short on distance. Large packs under an optimistic forecast overspend, mostly when the optimism peaks in autumn or winter.

**The measurement.** For each point we took the monthly ratio of 2005 to 2014 harvest to the 2015 to 2024 climatology and fitted its yearly cycle. The median amplitude across the 30 points is 1.8%, inside the range the last step swept. Above 50 degrees it is much larger: 8.5% at 60° N in the Atlantic, 7.8% in the Gulf of Alaska, 7.1% at 60° N in the Pacific and 6.1% in the North Sea. Single months there are off by 7 to 14%. At the northern points the climatology is too sunny in May to July.

All nine predictions held. That is less impressive than it sounds: several were cautious, and these counts are near their ceiling.

For someone writing a solar boat's energy manager: keep the 90-day harvest-over-forecast ratio. It is the rule that does not care which way the forecast is wrong. If the boat works high latitudes year after year, learn a month-by-month correction from its own earlier deployments. That is the next test, scored against the oracle.

Limits: one seasonal amplitude and one calendar phase shared by every point in the sweep; the measured amplitudes come from a 0.5 by 0.625 degree reanalysis grid and were not checked against a ground station; calm water, daily steps, one 4 m boat starting each year with a full pack. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zz).
