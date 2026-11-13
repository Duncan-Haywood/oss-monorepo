---
title: "A battery model's trust flag, without running the model"
date: 2026-11-13
tags: [cell-fidelity, battery-modelling, pybamm, spme, electrode-design]
seo_title: "Predict SPMe electrolyte depletion in closed form, before you simulate"
description: "A closed-form steady state with concentration-dependent diffusivity gives PyBaMM SPMe's minimum salt ratio to within 0.0003 on 408 fresh runs."
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's reduced SPMe model instead of the full DFN model. Since its first milestone, the answer has been a flag read off the SPMe run itself. If the electrolyte's salt concentration falls to 10% of its starting value anywhere in the cell, the design goes to DFN for a check. Over 19 (cell, current) conditions that flag has caught nearly every design SPMe gets wrong.

You need an SPMe run to read the flag. This step asked whether you do.

- **SPMe's salt minimum has a formula.** SPMe puts one uniform reaction rate in each electrode. Under a constant current, its electrolyte settles within minutes to a profile you can write down: a parabola in each electrode and a straight line across the separator. The minimum sits at a current collector and falls linearly with current. Everything in it comes from the parameter set and the design: thicknesses, porosities, Bruggeman exponents, salt diffusivity and transference number.
- **With constant diffusivity it ranks designs almost perfectly but is too pessimistic.** Over the 1,280 designs already simulated, the formula ranks designs as SPMe does (Spearman 0.99). It predicts which ones SPMe mis-scores against DFN about as well as SPMe's own simulated flag (AUC 0.951 against 0.957). But it calls too many designs depleted. In most parameter sets the salt diffusivity rises as the salt runs out, by 1.9 to 20 times, and this slows the depletion down.
- **The Kirchhoff transform fixes that and keeps it closed form.** Write the profile in Φ(c) = ∫D(c)dc instead of c. The steady flux becomes linear again, and one bisection enforces salt conservation. We wrote this version after the first verdicts, then registered a test for it before reading the 816 new PyBaMM runs. On those runs it **misclassified none of 408 designs, with a mean error of 0.0003** in the salt ratio. It takes about 0.05 s per design, against 1 to 30 s for the SPMe run it replaces.

So the trust test the programme has used since milestone 1 needs no simulation. A design pool can be split into "verify with DFN" and "screen with SPMe" before anything runs. Milestone 5g's skip-SPMe gate makes the same call from the formula as from the simulations on all 19 conditions. A cell engineer also gets a closed-form current at which a design empties its electrolyte, under SPMe's assumptions.

The limits are just as clear. The formula reproduces SPMe's electrolyte, not the cell's. DFN moves its reaction away from the depleted collector, so its own minimum is higher where SPMe empties, and differs from the formula by 0.03 on average. The formula says nothing about how far SPMe's energy score is from DFN's; that still takes a DFN run. The agreement holds for one PyBaMM version, with isothermal runs and the transference number held at its starting value. Three of the four fresh cells had been simulated before, on other designs and currents.

The plan, derivation, code, 1,688 scored designs and figure: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
