---
title: "One big survey boat or several small ones for the same money?"
seo_title: "Survey fleet sizing: one large boat vs several small, equal cost"
date: 2026-11-05
tags: [research, marine-fleet, autonomous-boats, surveying]
description: "In a simulated lawnmower survey, a fleet bought with one large boat's budget finishes in about a third of the time, unless the sonar is over half the cost."
---

The new `marine-fleet` project asks whether a budget buys a better survey as one 200 to 800 kg autonomous boat or as several smaller ones. Boats are scaled from the `marine-hull` reference (ITTC 1957 friction line), each works until its battery is spent, returns to base, swaps the pack and goes back out.

Over 2,916 swept cases the fleet is affordable in 2,187, finishes sooner in 2,178 to 2,186 of them and is never slower. The median completion-time ratio is 0.29 to 0.35 and the median energy ratio 0.20 to 0.35. The energy gap exists because a boat's power at a given speed grows with its mass while the swath, set by water depth, does not. The one gate is cost: once the payload (sonar and compute) is half a boat's price, no smaller boat is cheaper than half a big one, so the budget buys one boat.

What this does not show: swath is assumed independent of boat size, and there is no sea-state limit or longer-range sonar for the big boat. Those are the real case for a large vessel, and they are the next step. Simulation only. Code and numbers: `research/marine-fleet`.
