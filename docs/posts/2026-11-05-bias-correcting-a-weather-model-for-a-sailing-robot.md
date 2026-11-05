---
title: "Bias-correcting a weather model for a sailing robot: it stays level with persistence"
seo_title: "HRRR wind bias correction for autonomous sailing"
date: 2026-11-05
tags: [research, marine-hull, sailing, forecasting]
description: "Three bias corrections of archived HRRR winds for an hourly-replanning wing-sail boat, scored on real tide-station data: none beats following the headers."
---

A wing-sail robot that replans its tacks every hour needs a wind forecast. Last post in this series showed that raw archived HRRR winds (a 3 km model) lose to following the wind headers. This step asks whether a local correction can fix that.

I tried three: a speed ratio and direction offset from the trailing hour (1 h), from the trailing 3 h, and a 3 h correction anchored on the last 15 minutes and fading over two hours. Scored on 96 day-windows per month (January and July 2024) at 12 NOAA tide stations, against the header-follower (a rule with no forecast):

| variant | Jan, points vs header | Jul, points vs header |
|---|---|---|
| persistence (no model) | -0.2 | -2.6 |
| 1 h correction | -0.5 | -3.0 |
| 3 h correction | -1.0 | -4.5 |
| 3 h + 15 min fade | -0.7 | -2.5 |

A longer window is worse, because the wind shifts faster than a 3 h average follows. The fade rescues it but only to the level of persistence. Nothing beats following the headers. The caveat is large: the stations are on piers and harbours, so part of the gap is a 3 km cell compared with a pier anemometer, not forecast skill over open water. The buoy data that would test that was blocked from this environment.

Code, data and the pre-registered predictions (two of four refuted) are in `research/marine-hull/` (LOG.md, milestone 5i).
