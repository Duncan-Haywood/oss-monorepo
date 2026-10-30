---
title: "Should a solar survey boat slow down on rough days? A sweep, not a sea"
seo_title: "Should a solar boat slow down in rough seas? Speed policy sweep"
date: 2026-10-29
tags: [research, marine-hull, solar-usv]
description: "A 5 m deck-solar survey boat simulated over ten years of sunshine at five sites: how much does backing off on rough days gain over one cruise speed?"
---

The `marine-hull` research programme asks which small survey craft goes furthest per day. Its last step showed that a boat which keeps its calm-water cruise speed in a sea that doubles hull resistance loses 12 to 27% of its daily distance. Real seas come and go, so this step makes rough days intermittent: each day is rough with probability p, with resistance F times the calm value.

Over ten years of NASA POWER sunshine at five sites, for a 5 m boat with a 10 W hotel load:

- At p = 0.1 (one rough day in ten), ignoring the rough days costs under 1% against the best single speed.
- At p = 0.5 and F = 3, retuning one cruise speed for the mix gains 5.4% (Gulf of Alaska) to 14.5% (Florida Straits).
- A day-by-day back-off with perfect foresight adds up to 6.8% more (Equator), 0.6 to 3.9% at the Gulf of Alaska.
- The ordering of sites by distance never changes.

p and F are swept, not measured: no wave climatology was reachable, so this says nothing about any real sea. The 6.8% is an upper bound, since the back-off policy knows each day's sea in advance and is tuned on the same days it is scored on. My prediction that the gain would stay under 3% was wrong. Code, log and results: `research/marine-hull/`.
