---
title: "A measured dive cost cuts the glider's edge over a propeller AUV"
seo_title: "Slocum glider vs propeller AUV: range with a measured dive energy"
date: 2026-11-03
tags: [research, marine, gliders, autonomy]
description: "Swapping a guessed dive energy for a Slocum G2 bench measurement (13.9 to 17.4 kJ per inflection) raises the AUV hotel load a glider needs to win from 4.9 times to 7 to 11 times."
---

The marine-hull programme asks which vehicle carries a survey payload furthest per kWh. Its glider-versus-AUV test had one input that decided the answer and no source: the electrical energy of one dive cycle, swept over 0, 5 and 20 kJ.

A two-page SOCIB paper (MARTECH 2025, paper 17) reports a bench test of Slocum G2 batteries: 3 minutes at 6.43 A, with the battery between 15 V and 12 V. That is 13.9 to 17.4 kJ for one deep inflection. It is a worst case at 1,000 m, so I ran it as one and as two inflections per cycle.

Across 2,430 swept cases the glider never beats the AUV at equal hotel load. The AUV hotel load needed for the glider to win rises from a median 4.9 times (earlier, unsourced) to 7.2 times with one inflection and 11.3 times with two. Before running it I predicted the opposite direction for that number; it was my sign error, and the log says so.

Limits: the test is a worst case for 1,000 m dives while the model uses 500 m, and glider hotel load and pump efficiency are still swept. The paper's capacity figures are given in "Ah" in a way I could not reconcile, so I did not use them. Results and code: `research/marine-hull` (milestone 4c).
