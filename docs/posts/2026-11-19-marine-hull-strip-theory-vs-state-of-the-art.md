---
title: "Our strip theory against the published state of the art on a tank-tested Wigley"
seo_title: "Strip theory vs unified theory: Wigley heave and added resistance"
date: 2026-11-19
tags: [research, marine-hull]
description: "On Kashiwagi's slender Wigley our strip code matches his strip method within 5%, ties the best methods in heave, and trails them in added resistance."
---

The [last marine-hull step](2026-11-19-marine-hull-wigley-tank-data-strip-theory-vs-stawave2.md) checked our strip theory against towing-tank data on a slender modified Wigley hull (2 m long, Froude number 0.2) and found it right at the added-resistance peak but 26% high in heave near resonance. A reviewer's first question is how that compares with the best published methods on the same hull. The paper we took the measurements from, Kashiwagi (2022) in the *Journal of Ship Research*, answers that too. Its figures also plot four computed curves: his enhanced unified theory (EUT), his strip method (NSM), and both with a forward-speed correction to the free-surface condition. A fourth figure plots the measured heave-pitch cross-coupling coefficients from forced-oscillation tests. The figures are vector drawings, so we [read every curve](../../research/marine-hull/experiments/digitise_kashiwagi2022_curves.py) straight from the PDF's paths.

What we found ([results](../../research/marine-hull/experiments/results_kashiwagi_baselines.txt)):

- **The code is right.** Our strip heave is within 5% of Kashiwagi's independent strip code over wavelength/length 1.0 to 2.0, and our added-resistance peak (11.42) is 1.7% under his (11.62).
- **In heave it ties the state of the art.** Rms error against the tank over wavelength/length 0.8 to 2.0: corrected NSM 0.145, corrected EUT 0.156, ours 0.166, NSM 0.170, EUT 0.375. Every method except the corrected NSM overshoots at resonance, the corrected EUT by 30%. Our 26% overshoot is not a bug.
- **In added resistance it trails.** Rms error over wavelength/length 0.65 to 2.0: corrected EUT 0.95, corrected NSM 1.06, ours 1.55, the ITTC STAWAVE-2 formula 3.01.
- **The overshoot comes from one coefficient.** We put the measured coupling coefficients into our own motion equations, one group at a time. With the measured damping coupling (B35, B53) the error does not move: +26%. With the measured added-mass coupling (A35, A53) it goes to -10%. Strip theory gives A35 a speed term of -0.04 to -0.09 (non-dimensional) where the tank measures about zero. The Gerritsma-Beukelman form we use also sets A53 to exactly zero, which the tank contradicts.

Three of our six expectations, written down before the run, were wrong. We expected the corrected EUT to be best in heave, our coefficients to match the strip curve within 20%, and our added resistance to land within 1.5 times the best method. The log records each one.

This matters for the programme's headline number, a 3.7% range loss in waves for a 30 W survey boat. If the strip motion term errs, it errs high at resonance, so that number is not obviously too low. The next step carries the "no speed-induced added-mass coupling" variant to the survey boat and refits the damping. Limits: one hull at one speed, curves read from a secondary source's figures, and that variant was chosen after seeing the data.

[Figure](../../research/marine-hull/experiments/kashiwagi_baselines.svg) · [research log](../../research/marine-hull/LOG.md) · [programme README](../../research/marine-hull/README.md)
