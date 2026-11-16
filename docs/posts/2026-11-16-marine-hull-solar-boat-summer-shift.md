---
title: "A brighter summer forecast makes a solar boat bolder, not more cautious"
seo_title: "Solar USV seasonal correction: brighter summer, bolder boat"
date: 2026-11-16
tags: [research, marine-hull]
description: "Forcing a solar boat's learned summer correction 3% brighter or darker refuted our own explanation of why one learning year fails at high latitude."
---

A solar boat plans its battery use from a sun climatology. It learns a month-by-month correction from a season of its own log. At nine high-latitude points, one learning year (2007 for one half of the data, 2012 for the other) ruins that correction. It beats the plain 7-day trailing-mean rule in 1 of 168 test cases, while the best year wins 153. Every loss is on distance.

Two steps ago we [took that year apart](2026-11-15-marine-hull-solar-boat-cautious-year.md). Swapping in the right local-summer months fixed most of the damage. We also noticed, after the fact, that the two worst years were the only ones that had learned a brighter summer than the years they were scored on. The story we told: a summer forecast that is too bright makes the boat read an ordinary summer as a dark spell, so it holds back. The [next step](2026-11-15-marine-hull-solar-boat-bad-year-is-real.md) found the brightness differences behind that story (about 1%) are as large as the disagreement between two sunlight datasets. That left one way to test it: change a year's summer on purpose and watch what happens.

This step does that. We took the learned corrections of the best year, the worst year and the second-best year. We multiplied their local-summer months by 0.97 to 1.03 and left everything else as before (NASA POWER sunlight 2005 to 2014, four battery sizes, the climatology's real error plus 20 added seasonal biases). We wrote eight predictions down first. One held.

What came out:

- **A brighter summer makes the boat go further.** For the best year, distance against the baseline rises steadily with the shift in all 8 battery and half-decade series: at 10 kWh from 1.46 times the baseline at -3% to 1.79 at +3%. Payload downtime rises with it. The story predicted the reverse.
- **The worst year gets better when brightened, not worse.** At +3% it wins 32 cases instead of 1. Darkening it leaves 0.
- **Summer level is too small a lever to explain it.** The worst and best years differ by about 0.4% in their mean summer correction. Closing the worst year's gap takes about +10%: at that point it wins 124, the second-best year's count. That is roughly 25 times the real difference.
- **The best year sits at the edge.** Brightened more than 1%, it starts losing cases on payload downtime. Darkened 3%, it loses 25 cases, all on distance. The second-best year sits below the edge and gains as it is brightened (146 at +3%).

So the high-latitude count measures how bold a correction makes the boat. A correction can fall off either side: too timid loses distance, too bold loses payload hours. The bad year fell off the timid side because of the shape of its summer from month to month, not its average level. Our earlier explanation was wrong, and this test is the reason we know.

For anyone tuning a solar boat's energy manager: if a learned correction leaves the boat short on distance with dark hours to spare, a few percent more optimism in the summer forecast is a cheap fix. Judge a correction by which failure it risks, not by how close its average is to the truth.

Next: split the bad year's summer error into a tilt between early and late summer, with the level held fixed, and force that pattern onto the best year.

Limits: the shift is applied after the correction's clamp, and the three-month seasons are interpolated to days, so a summer shift also nudges the edges of spring and autumn. The 4% to 10% runs and the whole-year shifts were added after the main run, as description. The test uses one 4 m hull, calm water, daily steps and NASA POWER only, so it is simulation. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzn). Written with AI assistance.
