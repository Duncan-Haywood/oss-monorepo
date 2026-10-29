---
title: "What moves a solar survey boat's range most? Not the hull"
date: 2026-10-29
tags: [research, marine-hull]
description: "Hotel load and panel yield move a solar survey boat's daily range 2 to 5 times more than the hull drag constants do."
---

We model a 4 to 5 m deck-solar survey boat over ten years of daily NASA POWER sunshine at five ocean sites. Milestone 5k of the `marine-hull` programme swings six inputs one at a time and asks which moves the distance covered per day.

The hotel load (the payload and computer, 20 to 45 W against 30 W) moves km/day by 19 to 50%. Panel efficiency moves it 16 to 30%, and the panel derate 12 to 23%. The two hull-drag constants move it only 8 to 9%, and the wave-making scale 0.3 to 1.2%. The best constant cruise speed hardly shifts for any of them (0.0 to 0.2 m/s, on a 0.1 m/s grid).

Caveats: the ranges are my choices, not measurements, and the swings are one at a time. A prediction I made that the hull would lead at the Equator was wrong: the hotel load led there too. The next step is to source the hotel load and the panel yield, since they now dominate the uncertainty.

Code, log and data: `research/marine-hull/` (LOG.md, milestone 5k). This work was AI-assisted.
