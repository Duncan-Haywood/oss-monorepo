---
title: "The first L/B 10 tank check of our survey-boat wave model: it predicts 70 to 78% of the measured peak"
seo_title: "Wigley hull L/B 10 added resistance: strip theory vs tank"
date: 2026-11-20
tags: [research, marine-hull]
description: "Checked against Journée's L/B 10 Wigley hulls, our strip-theory model is low at Fn 0.2 and the transferred damping misses heave by 32%."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a slow 4 m survey boat loses to waves. Every tank check so far used one hull: Kashiwagi's modified Wigley, at a length-to-beam ratio (L/B) of 6.67 and one Froude number (Fn). Our boat is L/B 10. The paper draft lists that mismatch as a threat to validity, and every "next steps" list since milestone 7zc has asked for an L/B 10 test. This step (milestone 7zk) runs the first one.

## The data, and how far to trust it

Journée (1992, Delft University of Technology, Ship Hydromechanics Laboratory report 0909) tested four Wigley hulls in head waves. Wigley I and III are L/B 10 and beam-to-draft (B/T) 1.6, tested at Fn 0.2, 0.3 and 0.4. Our proxy could not reach the report or its data files. An independent open strip-theory code that did read those files quotes the measured added-resistance peaks in its documentation (boatmath, `docs/seakeeping-findings.md`, section 4.2). It also quotes one heave point, so this is a check on peak values and one heave value, taken second-hand. That repository has no licence, so we used only the numbers it quotes and none of its code.

## What we ran

The hull form comes straight from the published equation. The block coefficient of the built form, 0.561 for I and 0.463 for III, matches the report. Nothing was refitted. Heave damping is 3.75% of critical and pitch damping zero, the values milestone 7zg fitted to the L/B 6.67 hull's measured motions. We also ran zero damping and the older 2.5% value as checks. We committed six expectations to the log before the first run.

## Results

| Hull, Fn | Measured peak | Model peak | Ratio |
|---|---|---|---|
| I, 0.2 | 31.8 | 22.25 | 0.70 |
| I, 0.3 | 27.6 | 27.48 | 1.00 |
| I, 0.4 | 14.9 (marked noisy) | 27.97 | 1.88 |
| III, 0.2 | 22.2 | 17.38 | 0.78 |
| III, 0.3 | 20.2 | 25.39 | 1.26 |
| III, 0.4 | 27.7 | 27.80 | 1.00 |

Peaks are added resistance divided by rho g zeta² B²/L. The model row is strip theory plus Faltinsen's reflection term.

- At Fn 0.2, nearest the boat's own speed (about 0.16), the model predicts 70% and 78% of the measured peak. With no viscous damping at all it still predicts only 75% and 81%.
- Near resonance for Wigley I at Fn 0.3, the model's heave is 1.72 against a measured 2.52, 32% low (12% low with no damping). So a damping fraction fitted to one hull's motions does not carry to a slenderer hull. Every earlier step assumed it would.
- The model ranks the two hulls in the tank's order, and the choice of reflection term moves the Fn 0.2 peak by under 8%.

Three of the six expectations held. The two that matter, "within 25% at Fn 0.2" and "heave within 15%", failed.

## What it means for the boat

On the monohull, nearly all of the wave loss is the motion term: 2.84 N of 2.87 N at 1 m/s. As a post-hoc sensitivity, not a fit, we scaled that term by the Fn 0.2 ratios. The 30 W wave loss goes from 3.4% to between 4.2% and 4.8%. That is at or above the top of the paper's 3.4% to 4.2% bracket, and partly above the 2.5% to 4.3% range spanned by every earlier method. The hull ranking and the 200 W scope hold in every row.

We have not moved the bracket yet, because the check has three weak points:

- The data are second-hand peaks with no wavelengths.
- A peak ratio in regular waves is not the same thing as a ratio over a whole wave spectrum.
- The tank hulls' waterline is not quite the boat's.

The paper's threats section now gives these numbers. The next step is clear: get Journée's tables, fit damping to Wigley III's measured motions, and test the added resistance on data that fit never saw.

A side finding we have not traced: at Fn 0.3 to 0.4, the other code's Gerritsma-Beukelman peaks are 2 to 3 times ours, although both use the same method on the same hulls.

Code and results: [`run_journee_lb10.py`](../../research/marine-hull/experiments/run_journee_lb10.py), [`results_journee_lb10.txt`](../../research/marine-hull/experiments/results_journee_lb10.txt), and the [research log](../../research/marine-hull/LOG.md).
