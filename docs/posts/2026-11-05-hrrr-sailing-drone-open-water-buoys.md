---
title: "Open water did not rescue the weather forecast for a sailing drone"
seo_title: "HRRR vs header-following for a sailing drone: open-water buoys"
date: 2026-11-05
tags: [research, marine, sailing, forecasts]
description: "Repeating the HRRR test at 11 NDBC buoys: the model gap shrinks but a corrected forecast only matches following wind shifts."
---

The last marine-hull steps found that archived HRRR winds were no better than a sailing drone simply following wind shifts, but they were tested at piers and harbours, where a 3 km model cell and a pier anemometer disagree. This step repeats the test at NDBC buoys in open water (11 buoys with 2024 data, 72 windows in January and 80 in July).

Result: raw HRRR trails the header-follower by 0.8 points (January) and 2.3 points (July), against 2.9 and 6.5 at the piers. With a trailing-hour bias correction it is level in January (+0.0) and 0.9 below in July. Plain persistence scores +0.0 and -0.2. The synthetic forecast from earlier steps, skilled at 15-minute scale, gains 2.1 and 2.4. HRRR's direction error drops from 32-41 to 24-30 degrees, so siting explained part of the earlier loss, but not the rest.

Caveats: two months, every 4th day, buoy anemometers about 4-5 m up and not corrected to 10 m, an assumed 3 h delivery latency, and buoys 20 to 150 nm offshore rather than coastal sailing. The expectations were written down after the run, not before. Log, data and scripts: `research/marine-hull/LOG.md`, milestone 5k.
