---
title: "How fast can the tennis-ball feeder's wheels throw with topspin?"
date: 2026-11-08
tags: [robotics, open-tennis-robots, cad]
description: "The feeder model now finds the range of launch speeds its wheels and nip can deliver at a given topspin."
---

The feeder's launch check answered yes or no for one speed, 25 m/s with 3000 rpm of topspin. `Feeder.launch_window` now returns the whole range of speeds that pass, by bisecting the same two tests: wheel rpm within the 7000 rpm limit, and nip traction at least 1.5 times the push the launch needs.

At 3000 rpm topspin the window is 17.9 to 26.8 m/s. Below it the bottom wheel would have to spin backwards to make that much spin. Above it the nip's friction runs out. At 3500 rpm it narrows to 20.9 to 25.9 m/s, with the top wheel's rpm limit binding. At 4000 rpm no speed passes. If the ball squeeze is softer than assumed (15 N/mm instead of 20) the window is 17.9 to 23.2 m/s, and at 5 N/mm there is none.

Limits: the 20 N/mm stiffness, the 0.8 friction and the 7000 rpm limit are assumptions, and nothing is built. Measure the squeeze stiffness before choosing the top wheel's motor.
