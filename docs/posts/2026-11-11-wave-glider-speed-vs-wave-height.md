---
title: "Does a Wave Glider go faster in bigger waves? Barely, says a 2015 mission off Hawaii"
seo_title: "Wave Glider speed vs wave height: fielded data vs a foil model"
date: 2026-11-11
tags: [research, marine-hull]
description: "1,245 hours of a fielded Wave Glider, matched to NDBC buoy sea state: speed rises 5% from 1.5 m to 2.5 m seas, where a foil model predicts 90%."
---

A Wave Glider is a surfboard-sized float tethered to a rack of wings a few metres down. When waves lift the float, the wings get pulled up through the water, and their angle turns that heave into forward thrust. No battery goes to propulsion. The marine-hull programme had compared sun and wind as free ways to push a small survey vehicle, but it had never looked at waves.

NOAA's ERDDAP server publishes the telemetry from one fielded vehicle: Liquid Robotics' "Honey Badger", which UT Austin ran from Hawaii toward 30° N between May and November 2015. The telemetry includes speed through the water, so ocean currents don't affect it. We matched each hour of it to the nearest NDBC wave buoy and kept the 1,245 hours within 300 km of one.

Before the run we wrote down predictions for a simple physics model: the float follows the waves, the wings pitch to a stop, and the steady speed is where wing thrust balances drag. That model has a strong prediction built in. At a fixed wave period, speed should be proportional to wave height.

The data don't follow it. Median speed in seas of 2.5 m or more is only **1.05 times** the speed in seas of 1.5 m or less. The model says 1.9 times. When we fitted the model on June and July and tested it on August to October, it did worse than simply predicting the training median every hour. No setting of its wing constants fixed that.

Looking month by month (an analysis we added after the first run) shows why the pooled numbers look so flat. Median speed was 0.60 to 0.64 m/s in June and July and 0.41 to 0.47 m/s from August to October, even though the seas got bigger. Within a single month, speed does follow wave height: the Spearman correlation reaches +0.76 in September. A 30% loss over the mission, whose cause isn't in the data, is about as large as the whole effect of sea state. Fouling is the usual suspect on a months-long mission. Even with that drift removed, speed rises only about 18% from small to large seas.

For the programme's question we ran the fitted curves on 2024 sea states at its buoy sites. A wave glider makes roughly 33 to 50 km/day there. That's about half of what the solar boat can sustain, and below the wind drone, especially in winter. It spends no battery to do it, though, so it belongs on a distance-per-day chart, not a range-per-kWh one.

This is one vehicle on one mission, and some of the buoys are up to 300 km away. Code, data, pre-registered predictions and the results file are in `research/marine-hull/` (milestone 6p).

*Written with AI assistance (Claude Code).*
