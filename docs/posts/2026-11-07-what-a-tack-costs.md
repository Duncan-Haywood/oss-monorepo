---
title: "What a tack really costs an ocean sailing drone, and why it flips a controller ranking"
seo_title: "Saildrone tack cost: 218 s measured, and what it changes"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "Fielded Saildrone data put a tack near 218 s, not the 30 to 60 s we assumed. At that price header-following stops beating plain edge tacking."
---

Our sailing-drone simulations priced a tack at 0 to 60 seconds of lost progress. Nobody had measured it. From 1,147 tack pairs in 10-minute blocks of fielded Saildrone data (summers 2018 and 2019), the effective loss is 218 s (bootstrap 95% interval 127 to 301 s), and 373 s when matched on sailing angle. It includes recovery and the controller's reasons for tacking, so it is an upper bound on the manoeuvre.

Rerunning the controllers at 120, 240 and 360 s: the header-following rule's edge over simply tacking at the corridor edge falls from +3.2 points (30 s) to +2.3, +0.8 and +0.0. I predicted it would grow; it did not. The clairvoyant gap grows to 16 to 26 points, so what pays at a fielded tack price is knowing the wind ahead.

Rerunning also exposed a bug: controllers had silently clipped any tack to one 60 s step. The remaining one-step controllers now refuse long tacks instead of returning a wrong number. Reports, code and tests are in `research/marine-hull/`.
