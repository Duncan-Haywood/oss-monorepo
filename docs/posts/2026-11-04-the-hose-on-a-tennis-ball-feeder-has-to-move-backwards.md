---
title: "The ball hose on our tennis robot has to move backwards as the head tilts"
seo_title: "Hose take-up for a tilting tennis ball launcher: sizing a pulley"
date: 2026-11-04
tags: [open-tennis-robots, cad, engineering]
description: "Sizing a floating-pulley take-up for the ball hose of an open-source tennis ball feeder, and a surprise: the pulley must reverse at level."
---

The open tennis ball robot tilts its launcher head from -15 to +45 degrees,
and the hose that feeds it balls from a tub has to follow. A fixed cut length
does not fit every pose, so the design needs about 258 mm of take-up.

This week we sized it: one floating pulley 300 mm across (twice the hose's
150 mm minimum bend radius) on a 489 mm track with a 129 mm stroke, pulled by a
10 N spring. Checking each pose separately turned up something we had not
expected. The level (0 degree) pose has the shortest longest-fit, so it sets
the fixed length, and the pulley's allowed travel there is exactly zero. As the head
tilts either way the pulley must move out, so it goes out, back to zero and out
again rather than one way. The spring has to keep the hose taut through that reversal.

All of it is a 2-D proxy with assumed tension and margins; the next step is to
model the pulley, track and spring as parts, and then hang a real hose to check.
Code and numbers: `ventures/open-tennis-robots/cad`.
