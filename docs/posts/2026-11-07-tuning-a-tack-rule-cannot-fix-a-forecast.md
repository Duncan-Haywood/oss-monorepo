---
title: "Tuning a tack rule cannot rescue a weather forecast for a sailing drone"
<<<<<<< HEAD
seo_title: "HRRR forecast and sailing drone tacks: a margin only turns it off"
=======
seo_title: "HRRR and drone tacks: a switch margin only turns the forecast off"
>>>>>>> origin/main
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "At a measured 240 s tack cost, archived HRRR winds lose to a simple header-following rule; a switch margin only makes HRRR copy it."
---

With a synthetic forecast, replanning a sailing drone's tacks gains 7.5 to 11 points of progress at a 120 to 360 s tack cost. I expected real archived HRRR winds (3 km) to collect some of that. They did not (marine-hull programme, milestones 6za and 6zb, July 2024, 10 NDBC buoys).

At 240 s a tack, bias-corrected HRRR is 2.4 points below the header-following rule (95% interval -4.8 to -1.0); raw HRRR is 5.5 below, and it tacks more (66 against 44 a day). I then tried a switch margin, so a voluntary tack happens only if the forecast's gain beats several steps of progress. Chosen on January, margin 4 brings bias-corrected HRRR to -0.2 points (-1.9 to +0.0). The best cell anywhere is +0.0: the margin does not extract skill, it makes HRRR converge on the header's roughly 42 tacks a day, switching the forecast off.

Limits: windows within a month are not independent, so the intervals are optimistic; one tack price; HRRR only. The open input is a forecast with real skill at 15 minutes. The log and numbers are in `research/marine-hull/LOG.md`.
