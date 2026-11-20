---
title: "Gerritsma-Beukelman against a 3D far-field calculation: 2.3 to 2.8 times too high at zero speed"
seo_title: "Gerritsma-Beukelman vs Maruo far-field added resistance"
date: 2026-11-20
tags: [research, marine-hull]
description: "At zero speed the Gerritsma-Beukelman formula gives 2.3-2.8 times the 3D far-field (Maruo) added resistance on two Wigley hulls, checked by energy conservation."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much head waves cost a 4 m autonomous survey boat. Most of that cost comes from one formula, Gerritsma and Beukelman's (1972) radiated-energy estimate of added resistance. It treats the hull as a row of 2D slices and adds up the wave energy each slice radiates as it moves relative to the incoming wave. The [previous step](2026-11-20-marine-hull-strip-theory-vs-3d-panel-code.md) found that feeding 3D motions into the formula moves its answer by only 1% to 5.5%. That step did not test the formula itself, because both sides still used the 2D slices.

This step does. Maruo's (1960) far-field formula gets the mean wave force from the waves the hull sends out to infinity, with no slicing at all. The open-source panel code [Capytaine](https://github.com/capytaine/capytaine) (version 3.0.0) computes those far-field waves (the Kochin function) from a 3D panel solution and includes Maruo's formula. We used both as shipped, on the same two hulls as before: the Kashiwagi tank hull (length/beam 6.67) and the 4 m monohull (length/beam 10), at zero forward speed in head waves.

**Two checks first.** On a fixed vertical cylinder the panel answer is within 1.3% of the exact drift force, which we computed independently from the classical scattering series. On the hulls, the far-field waves conserve energy to within 1.4% at every wavelength, with the hull held fixed and with it moving. With the motions doubled on purpose, the same check fails, so it is a real test of the motions.

**The result.** Over wavelengths of 0.5 to 2 hull lengths, the Gerritsma-Beukelman formula gives **2.30 times** the 3D added resistance on the tank hull and **2.80 times** on the monohull. The peaks sit at the same wavelength (about half the hull length at zero speed), but the formula's peak is 2.5 to 3.3 times higher. Seven of the eight expectations written down before the run held. The one that failed: in the shortest waves, the 3D answer for the fixed monohull is about five times the textbook short-wave reflection formula, not the 1.5 to 4 times we had predicted.

**Why, in part.** The formula adds up the slices' energy as if their waves never met. In 3D they interfere. Adding them up coherently instead (a rough check run after the main result) brings the formula within 3% to 40% of the 3D answer near one hull length, but makes short waves worse. In short waves the hull hardly moves, and the formula counts the incoming wave sliding past each slice as radiated energy. The 3D far field does not show that energy.

**What it changes.** The same formula sits close to tank measurements at Froude number 0.2, so its error must shrink a lot between standing still and that speed. The monohull's wave-loss estimate (3.4% to 4.2% of a 30 W budget) uses the formula at Froude number 0.16, so the paper now says outright that carrying the formula's accuracy from 0.2 down to 0.16 is an assumption we have not checked. For a boat that drifts or holds station, the formula would overstate the wave loss by roughly the factor above.

Not covered: forward speed, viscous damping, and a second code's 3D result on these hulls. The script is [`run_maruo_check.py`](../../research/marine-hull/experiments/run_maruo_check.py) (about 4 minutes); results are in [`results_maruo_check.txt`](../../research/marine-hull/experiments/results_maruo_check.txt) and the interference check in [`results_maruo_posthoc.txt`](../../research/marine-hull/experiments/results_maruo_posthoc.txt).
