---
title: "The year that breaks a solar boat's learned correction is real weather, and it looks ordinary"
seo_title: "Solar USV seasonal correction: bad learning year checked against ERA5"
date: 2026-11-15
tags: [research, marine-hull]
description: "ERA5 reanalysis confirms the NASA POWER weather of the learning year that breaks every high-latitude correction, and shows that year is not unusual in size."
---

A solar survey boat plans its battery use from a sun climatology, and earlier steps of this programme taught it to correct that climatology from its own log. At nine high-latitude ocean points, one learning year kept breaking every correction. Learned from that year (2007 when scoring 2010 to 2014, 2012 when scoring 2005 to 2009), the raw month-by-month correction beats the baseline in 1 of 168 cases. Learned from the best year, it wins 153. Doing nothing wins 25.

Every number so far came from one satellite product, NASA POWER. So before the paper calls this a property of the weather, it has to rule out a property of the data. This step fetched ERA5 reanalysis sunlight for the same nine points and twenty years. ERA5 is an independent estimate: a weather model constrained by observations, with no surface radiation assimilated. We compared the two month by month. Five predictions were committed before any comparison ran.

What came out:

- **The weather is real.** The two sources' month anomalies for 2007 and 2012 correlate at r = 0.71, about as well as in any of the ten years (0.60 to 0.80). The error the boat would have learned from that year correlates at r = 0.77 between sources. In the months that carry the most energy and the largest errors, the two agree in sign 69 times out of 74.
- **The year is not an outlier.** By the size of its month-by-month departure from the years being scored, the bad year ranks third of five learning years in NASA POWER and second in ERA5. The spread between all five is small. The year that departs the most in both sources is a different one, and a correction learned from it wins 50 of 168 cases. Another that departs more than the bad year in NASA POWER wins 124.
- **One prediction failed.** We expected ERA5 to rank the bad year as the most unusual of the five. It did not.
- **A finer mechanism does not survive the second source.** A sibling step, which landed while this one ran, found that in NASA POWER the bad years learned a slightly brighter local summer than the years being scored. We checked that afterwards, without a prediction. NASA POWER shows it. ERA5 does not: there the best learning year also had a brighter summer. The summer differences involved are about 1%, the same size as the gap between the two sources.

For a team running solar boats at high latitude: switching to a different sun data source would not have saved this correction, and a check on whether the learning year looked unusual would not have flagged it. What hurts is the pattern of an ordinary year (which months it got wrong, and in which direction) meeting the battery. The sibling step traced it to the local summer. A planned test that shifts a good year's summer by 1 to 3% will say whether that holds, without depending on a 1% difference between data sources. Until then, the guard that works is the one earlier steps found: more seasons of log, or shrinking the correction toward a latitude-band pool.

Limits: this compares sunlight only. ERA5's anomalies were not run through the boat model, so we have not shown that an ERA5-trained correction fails in the same cases. Both sources model clouds; neither is a pyranometer on a buoy, and that check is still to do. There are nine points, one grid cell each. The code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzm). ERA5 data: Copernicus Climate Change Service via Open-Meteo, CC BY 4.0. Written with AI assistance.
