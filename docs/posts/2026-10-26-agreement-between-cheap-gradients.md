---
title: "When two redundant trainers agree, does the requester save anything?"
date: 2026-10-26
description: "On a small transformer, honest gradients always agree, quarter-batch cheats agree 4 to 43% of the time, and paying for agreement saves 12 to 14% in one corner."
tags: [verifiable-training-mechanisms, research, mechanism-design, verification]
---

[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) asks how a requester should pay for outsourced training when a referee only checks a step to a tolerance. An earlier milestone showed that adding an agreement test between two redundant workers can only lower the cost of the contract when cheats are less alike than a cheat and an honest worker. That used assumed agreement rates. This run measured them.

Over 10 seeds of a 2-layer character transformer, two honest gradients (batch rows reordered) always agreed. A cheat that trains on a random quarter of the batch agreed with the honest gradient with probability 0.04, 0.12, 0.22 and 0.43 at tolerances 1e-3, 1e-2, 3e-2 and 1e-1. Two independent such cheats agreed with each other less often (0.03, 0.10, 0.19, 0.35), with non-overlapping seed ranges. Putting the measured numbers into the contract linear programme, with copying excluded as an equilibrium, agreement beat audit-only in one cell group: tolerance 1e-1, audit rate 0.1, saving 12 to 14%. Everywhere else the costs were equal, and cheats that submit one shared vector (a shared quarter, a reused gradient) got no saving at all.

My prediction that the peer contract would never be cheaper was wrong, and the log says why: the contract can only use the gap between the two cheat agreement rates, at most 0.08 here. Limits: distances taken along the honest trajectory, one model, one corpus, contract parameters chosen rather than measured. Code, results and log are in the project folder.
