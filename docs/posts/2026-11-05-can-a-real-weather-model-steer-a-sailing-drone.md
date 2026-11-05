---
title: "Can a real weather model steer a sailing drone? Not yet, on these stations"
seo_title: "HRRR wind forecast for an autonomous sailboat tack planner: negative result"
date: 2026-11-05
tags: [research, marine-hull, sailing-drone, forecasting]
description: "Replanning a wing-sail drone's tacks from archived 3 km HRRR winds loses to simply following the wind headers, and three bias corrections do not fix it."
---

Earlier runs of the marine-hull programme found that a wing-sail drone could gain about 5 points of upwind progress by planning its tacks a day ahead, but only if the wind forecast is good at 15-minute scale. That was tested on a made-up forecast error. This week we swapped in real archived forecasts: NOAA's HRRR 10 m winds at 3 km, for 12 coastal stations in January and July 2024.

Raw HRRR loses. It lands 2.9 points (January) and 6.5 points (July) below a controller that just follows the wind headers, and below plain persistence. The error does not grow with forecast lead (about 1.7 to 2.0 m/s speed error and 32 to 41 degrees of direction at every lead), so it is a siting mismatch: a 3 km grid cell against an anemometer on a pier.

We tried three fixes. A trailing-hour speed and direction correction recovers about 2 points and still sits 0.5 (January) and 3.0 (July) below the header-follower. A longer 3 h window is worse, because the wind shifts faster than the average follows. A fade from the short to the long correction adds at most 0.6 points. Today's try, a station bias learned from the other days of the same month, is worse again (1.0 and 4.5 points below), with more tacks. The stable part of the mismatch is a speed ratio of about 0.77, but correcting it does not help; the day-to-day shifts are what matter.

What this does not say: HRRR is a poor forecast over open water. The stations are on piers and harbours, and the buoy data host that would test open water refused our connection. Two months, every 4th day, one model.

Code, data and numbers: the [marine-hull programme](../../research/marine-hull/README.md) (`LOG.md`, milestones 5h to 5j).
