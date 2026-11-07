---
title: How many idle rotors explain a delivery drone's range claim?
date: 2026-11-07
description: "Four stopped lift rotors of the Wingcopter 198 would add enough drag to match its quoted 94 km range; all eight would overshoot it. A plausibility range, not a finding."
tags: [research, uav, aerolog-scaling]
---

The Wingcopter 198 claims 94 km, but a clean airframe with its 1.98 m span would fly further. Earlier steps showed the gap needs extra zero-lift drag. The 198 has eight motors, so we asked how many stopped rotors would account for it.

With two assumed blades per rotor and a blade frontal area of 0.003 m², four stopped rotors give a lift-to-drag ratio of 6.4 to 7.7, which brackets the 6.8 the claim implies. All eight stopped overshoot it (5.1 to 6.0) unless the blades are slimmer. Two stopped rotors leave L/D around 8.

This is a plausibility range, not a finding. The rotor count comes from secondary sources, and the blade size, the tilt/fixed split and the wing area are unknown. Code and log: `research/aerolog-scaling` (milestone 10i).
