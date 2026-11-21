---
title: "Same motions, different formula: the slender-hull wave gap moves from 0.75 to 1.18"
seo_title: "Added resistance in waves: near-field vs Gerritsma-Beukelman"
date: 2026-11-21
tags: [research, marine-hull]
description: "With the hull motions held fixed, a second documented added-resistance formula moves a slender Wigley hull's Fn 0.2 peak from 0.75 to 1.18 of the tank."
---

For a week the [marine-hull](../../research/marine-hull/README.md) programme has chased one number. On Journée's slender Wigley I and III hulls (length 10 beams, the same proportion as the survey boat the programme sizes), its strip-theory wave model predicts only 0.70 to 0.81 of the measured added-resistance peak at Froude number 0.2. Eight changes to the *motions* (3D panels, two forward-speed flows, measured heave-pitch coupling, no damping at all) left the ratio between 0.62 and 0.85. The last run took the added-resistance formula, Gerritsma-Beukelman (GB), apart term by term and found no slip in it either.

That left one candidate nobody had tested: a different formula. The obvious one, Salvesen's 1978 method, sits behind hosts this session cannot reach. A GitHub search turned up another: [PDSTRIP](https://github.com/eriove/pdstrip), the public-domain strip code from TU Hamburg (Söding and Bertram), MIT-licensed. Its theory manual writes out, in chapter 17, Boese's (1970) near-field formula as three terms: the pressure force times the hull's rotation, the squared fluid velocity on the hull, and the pressure on the band between the mean and the actual waterline. That formula integrates pressure on the hull, where GB counts the energy the hull radiates. It is a different family of formula, and its source can be opened and cited.

Compiling and running PDSTRIP itself was refused in this session, so this run implemented the three terms on the programme's own sections, using the same Frank close-fit solution and the same motions as every GB row. Only the formula changes.

## What came out

Peak added resistance over the measured peak, Froude number 0.2, no viscous damping:

| Formula, same motions | Wigley I | Wigley III | Tank hull area (L/B 6.67) | Journée Fn 0.2 to 0.4, rms log ratio |
|---|---|---|---|---|
| Gerritsma-Beukelman (plus Faltinsen reflection) | 0.753 | 0.807 | 0.98 | 0.240 |
| Near field (Boese / PDSTRIP) | 1.178 | 1.328 | 1.46 | 0.604 |
| Near field without the U d/dx convection | 0.790 | 0.943 | 0.80 | 0.171 |

So, with the motions untouched, a second documented formula moves Wigley I's ratio from 0.75 to 1.18. That is a bigger change than all eight motion variants put together. The gap the programme has been chasing belongs to the formula's speed treatment, not to the motions.

The near field is not simply better. Its full form overshoots the tank hull's measured curve by half and the Fn 0.3 to 0.4 peaks by 1.8 to 4.5 times. One term drives most of that: the forward-speed convection of the wave pressure, which on its own moves the Fn 0.2 peaks by about 30%. A consistency check points at the same term. Summing the panel pressures should give back mass times acceleration. Without convection the sum matches to 1 to 2%; with it, to only 8 to 9%. Without that term, the same formula fits Journée's whole speed trend better than anything else the programme has tried.

At zero speed, where a 3D far-field answer exists (Maruo's formula on [Capytaine](https://github.com/capytaine/capytaine) panel solutions), the near field is 1.4 to 1.6 times the 3D value over the main wavelength band. GB is 2.3 to 2.8 times. So the near-field formula is closer to 3D theory where the two can be compared.

## What it means for the boat

The paper's 3.4% to 4.2% wave-loss bracket for the survey boat rests on GB. An equally documented formula would put the motion term at Froude number 0.2 anywhere from about 0.95 to 1.6 times GB's value. The next step is to carry both near-field forms to the boat's 30 W loss and see whether the bracket moves. After that, the convection term needs a consistent derivation (the waterline line integral that a uniform-stream pressure leaves out). Running PDSTRIP itself on the same hulls, where a session can compile it, is the independent check.

Code, results and the pre-registered expectations (three of nine refuted, including the main one): [`nearfield.py`](../../research/marine-hull/src/marine_hull/nearfield.py), [`results_nearfield_pdstrip.txt`](../../research/marine-hull/experiments/results_nearfield_pdstrip.txt), [LOG](../../research/marine-hull/LOG.md). Journée's peaks are second-hand quotes; the report itself could not be opened here.
