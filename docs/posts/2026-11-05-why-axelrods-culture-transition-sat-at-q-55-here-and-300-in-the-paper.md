---
title: "Why did Axelrod's culture transition sit at q = 55 in our code and 300 in the paper?"
seo_title: "Axelrod culture model critical q: uniform versus Poisson traits"
date: 2026-11-05
tags: [research, civ-levers, axelrod, simulation]
description: "Castellano, Marsili and Vespignani draw Axelrod traits from a Poisson distribution with mean q. With that, our transition moves from 55 to 230 at L = 80."
---

In `civ-levers` we simulated Axelrod's culture model with F = 10 features and found the order-disorder transition (largest region falling through half the lattice) at q = 43, 50, 55 for L = 20, 40, 80. Castellano, Marsili and Vespignani (2000) report q_c of about 300. Three runs logged that as a disagreement.

Rereading their model section, they draw each trait from a Poisson distribution with mean q, not uniformly on 1..q. Two Poisson(q) draws agree with probability about 1/(2 sqrt(pi q)), so Poisson 300 behaves like a uniform alphabet of about 61 traits, close to our 55.

We added a Poisson mode to the C core and ran 40 runs per cell. The half-crossing is now q = 135, 180, 230 at L = 20, 40, 80, rising toward 300. The collision-rate mapping predicted 147, 199, 240 before the run, within 10%.

Not shown: L = 150 was not run, so we have not reached 300 ourselves, and the 0.5 crossing is not their jump-based q_c. Data and log: `research/civ-levers/experiments/culture/poisson_results.txt` and `LOG.md`.
