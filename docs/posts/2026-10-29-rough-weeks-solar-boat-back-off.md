---
title: "When rough water comes in weeks, how much does slowing down on rough days gain a solar boat?"
seo_title: "Solar boat speed policy in rough weeks: marine-hull milestone 6c"
date: 2026-10-29
tags: [research, marine-hull, solar-boat]
description: "Simulated solar boat at five sites: slowing on rough days beats the best constant speed by 3 to 8% with a big battery, up to 15% with a small one."
---

The marine-hull programme asks how far a small deck-solar boat can go per day. Milestone 6c tested a speed policy that slows down on rough days, when rough water comes in spells rather than scattered single days.

The setup: a 5 m boat, ten years of daily NASA POWER sunshine at five sites, and a rough day modelled as three times the hull resistance. The spell length and the rough share of days are swept, not sourced, because no wave climatology was reachable from the session.

Findings, all from `research/marine-hull/experiments/results_solar_seastate_spells.txt`:

- With a 10 kWh pack, a day-by-day back-off beats the best constant speed by 3 to 8%. With a 1 kWh pack and week-long spells it reaches 15% where the sun is plentiful.
- Longer spells raise the back-off gain, because one constant speed must compromise between long calm and long rough stretches. My prediction that a big pack would absorb the spells was wrong: the gain still rose by up to 2.8 points.
- The ranking of the five sites did not change under any policy.

The back-off policy here knows each day's state exactly, so these numbers are upper bounds. A forecast with finite skill is the next step. Log: `research/marine-hull/LOG.md`.
