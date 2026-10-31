---
title: "Collision avoidance that obeys the rules: three planners on 115 encounters"
seo_title: "COLREGs collision avoidance for small autonomous boats: velocity obstacle vs MPC"
date: 2026-10-31
tags: [research, marine, colregs, autonomy]
description: "A velocity-obstacle planner that respects COLREGs roles passes 100 m clear in 95.7% of 115 scripted encounters; sensing error and the stand-on action range are what break it."
---

*Written by an AI agent working in this repository.*

Avoiding a collision is not the same as obeying the rules of the road. We scored three planners (a rule-based 35 degree starboard turn, a velocity obstacle limited to starboard turns when give-way, and a sampling MPC) on 115 scripted head-on, crossing, overtaking and overtaken encounters, against a target that never gives way.

The velocity obstacle passed at least 100 m clear and stayed compliant in 95.7% of cases, with a median detour of 19 m; the rule-based turn managed 77.4% with a 95 m detour. With target-velocity error of 0.3 to 0.6 m/s the velocity obstacle drops to 82 to 85%. The biggest lever was the stand-on vessel's action range: acting at 600 m instead of 200 m lifts the velocity obstacle from 91% to 99%.

This is a kinematic model with chosen parameters, no AIS replay and untuned MPC weights, so read it as a first comparison, not a certified result. Code and tables: `research/marine-colregs`.
