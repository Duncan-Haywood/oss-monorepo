---
title: "Right is not the same as provably right: certifying a cheap cloth model's hanger choice"
seo_title: "Certifying a cheap simulator's design choice: cloth and hangers"
date: 2026-11-22
tags: [research, robotics, cloth-simulation, multi-fidelity, digital-twin, design-optimisation]
description: "Three top-tier cloth solves certify the spring sheet's hanger choice on 8 of 18 cases, but the always-right 2D chain's on only 1. Flatness, not accuracy, wins."
---

Yesterday's step of the [`hanger-codesign`](../../research/hanger-codesign/)
programme found that a 2D cloth chain, 1.7 cm wrong about the shape of a hung
shirt, still picks the same hanger arm width as our best finite-element model
on all 18 fabric-setting cases (nine measured wovens from Petrak et al. 2021,
[doi:10.3390/ma14216259](https://doi.org/10.3390/ma14216259), with bending as
measured and as calibrated). That is good news found after the fact, by running
the expensive model on every width. A design loop wants to know *before* it
pays for that.

## The question

Earlier milestones proved a bound on the regret of trusting a cheap model's
choice. If e(d) is the cheap model's error at design d and K bounds how fast e
changes across designs, the top-tier regret of the cheap choice d^ is at most

    R(K) = max(0, max over d of [ K |d − d^| − (cheap score at d − cheap score at d^) ])

and R = 0 is a certificate: no top-tier run can overturn the choice. K is
estimated from three top-tier runs, at the choice and its two neighbours. Until
today the "top tier" in those tests was our own spring sheet. Today it is the
calibrated finite-element tier, on 45 instances and no new simulation
(`experiments/m5c_tier_bounds/`; nine predictions committed first).

## What we found

| cheap tier → top tier | cases | wrong | certified from 3 top-tier runs | error slope (median, cm per cm) |
|---|---|---|---|---|
| 2D chain | 18 | 0 | 1 | 0.58 |
| 3D spring sheet | 18 | 1 (0.050 cm) | 8 | 0.11 |
| top tier, bending uncalibrated → calibrated | 9 | 0 | 6 | 0.10 |

The chain is never wrong and almost never certifiable. Its width curve is a
sharp V (it beats the runner-up by 0.47 cm). The top tier's curve is shallow.
So the chain's error tilts across widths faster than its own margin, and the
bound cannot rule out a better width without running it. The spring sheet is
less sharp but bends the same way the top tier does. Its error is nearly
flat, so three runs certify it on 8 of 18 cases. On the one case it gets
wrong, the bound from those three runs equals the realised regret exactly.

We predicted the opposite order (chain easier than sheet) and were wrong. The
lesson for multi-fidelity design is that the tier worth verifying against is
the one whose error is flattest across the design space, not the one closest
in absolute terms.

We also tried borrowing the slope from the other eight fabrics, so a fabric
needs no top-tier run at all. That bounds the regret of trusting the chain at a
median 0.15 cm (worst 0.27) and the sheet at 0.12 cm (worst 0.20), but it
certifies none, and the borrowed slope undershoots a fabric's own on 2 of 18
cases per tier. It is an estimate, not a guarantee.

## Limits

Five candidate widths, so the three verification runs are already most of the
grid and the run saving is small. One hanger profile. The reference is a
simulated top tier, not a camera on a real hung garment. The next steps are a
finer width grid around the optimum, where margins shrink and the certificates
are tested hardest, and the multi-fidelity design loop with the sheet as the
verified screen.

Code, tables and the full prediction scorecard are in the
[project README](../../research/hanger-codesign/README.md#milestone-5c-certificates-on-the-calibrated-top-tier-and-a-slope-borrowed-from-other-fabrics).
