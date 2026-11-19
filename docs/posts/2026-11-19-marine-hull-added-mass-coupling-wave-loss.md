---
title: "Two ways to fix strip theory's heave overshoot, and why the wave-loss estimate doesn't care"
seo_title: "Strip theory heave overshoot: coupling vs damping"
date: 2026-11-19
tags: [research, marine-hull]
description: "Dropping the heave-pitch added-mass coupling or adding 2.5% viscous damping both fix strip theory's heave peak; the 4 m boat's 30 W wave loss stays 3.7%."
---

The [previous marine-hull step](2026-11-19-marine-hull-strip-theory-vs-state-of-the-art.md) found where strip theory's heave overshoot comes from on Kashiwagi's slender Wigley tank model. The speed-induced added-mass coupling between heave and pitch (A35) is the culprit. Setting A35 and A53 to zero gave better heave than any published method. That raised a question for the [programme](../../research/marine-hull/README.md)'s headline number. The boat's 3.7% wave loss at 30 W came from a viscous damping fitted to the tank's added resistance *with* that coupling left in. Had the damping been soaking up a coupling error?

So this step refits the damping with the coupling rule on, and carries it to the 4 m survey monohull. Its plan and seven expectations were committed before the run.

- **The loss barely moves.** With the rule, the fitted damping falls from 2.5% to 1.8% of critical, and the 30 W bow-sector loss goes from 3.69% to 3.75%. The per-series fits span 3.1% to 4.2%, and the hull still leads every hydrofoil case up to 200 W of payload.
- **The motions pick a side.** The damping fitted to added resistance alone, with the coupling as is, already brings heave at resonance to +3.3%. That gives an rms error of 0.135, lower than any of Kashiwagi's published curves. Stacking the rule on top of its own fitted damping overdamps heave to -19%. One expectation said the rule would keep heave at least as good as 7ze's 0.140, and it was refuted.
- **What it means.** The two fixes are substitutes, not complements. The tank data fit "strip coupling plus about 2.5% viscous damping" and not both together. The rule stays as a sensitivity case, and the 3.7% estimate stands, now checked against both readings.

The limits: this is one hull at one speed. A single damping fraction for heave and pitch makes pitch worse (rms 0.151 to 0.213), so a joint fit with separate heave and pitch damping, held out against added resistance, is the next step. The survey boat (length/beam 10) is more slender than this tank model.

Code: the rule is a flag, `no_added_mass_coupling=True`, on the [strip-theory solver](../../research/marine-hull/src/marine_hull/strip.py). Run: [`run_a0_coupling_transfer.py`](../../research/marine-hull/experiments/run_a0_coupling_transfer.py). Results: [`results_a0_coupling_transfer.txt`](../../research/marine-hull/experiments/results_a0_coupling_transfer.txt).
