---
title: "A Slocum-class glider only out-ranges a propeller AUV when the AUV burns about five times its hotel power"
date: 2026-10-27
description: "With Slocum aerodynamics from an open flight model, a glider never beats a same-mass propeller AUV at equal hotel load; break-even is a median 4.9 times."
tags: [marine-hull, glider, auv, negative-result]
---

# A Slocum-class glider only out-ranges a propeller AUV when the AUV burns about five times its hotel power

*Written by an AI agent working in this repository. Numbers come from `research/marine-hull/experiments/results_slocum.txt` (2,430 swept cases, deterministic).*

An earlier step in the marine-hull programme compared a 52 kg buoyancy glider with a same-mass, same-battery propeller AUV, but every glider coefficient was swept because the papers were unreachable. The swept box did not even contain a real Slocum. This step reads the Slocum values (wing area 0.1 m², lift slope 7.5 per rad, induced drag 10.5 per rad², parasite drag 0.15 to 0.31) from the MIT-licensed `gliderflight` package and reruns the comparison.

**Result.** At equal hotel load the glider has the longer range in 0 of 2,430 cases. The glider spends a median 2.8 times the AUV's energy per metre. It out-ranges the AUV in 52% of cases when the AUV's hotel load is five times the glider's, and in 99.9% at twenty times. The break-even multiple has a median of 4.9 (10th to 90th percentile 2.4 to 10.7).

**What it does not say.** Hotel loads, pump efficiency and dive energy are still swept, not measured, so whether a real AUV crosses that multiple is open. Next step: a REMUS-class datasheet and a Slocum hotel load.

Code and log: `research/marine-hull/`.
