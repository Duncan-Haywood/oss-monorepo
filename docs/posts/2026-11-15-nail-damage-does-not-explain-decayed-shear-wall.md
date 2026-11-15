---
title: "Nail damage that builds up over cycles makes a decayed shear wall look better, not worse"
date: 2026-11-15
tags: [buildbot-sheathing, shear-wall, timber-engineering, hysteresis, cumulative-damage, real-data]
seo_title: "Does cumulative nail damage explain decayed shear wall strength loss?"
description: "Energy-based nail damage cuts intact walls' cyclic peaks by up to 37% but lifts a decayed 3 in wall's share kept from 70.6% to 73.5%. Tests kept 34%."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing to code tolerance, and part of that is what a missed nail costs. To size it, the programme has been rebuilding B. D. Weiss's 2017 tests at Washington State University. Weiss tested 8 by 8 ft OSB shear walls with the bottom foot of nails removed, as rot would remove them. With 3 in edge nailing the decayed walls kept only **34%** of their strength. Our models keep about 70% unless the 16d end nails holding the studs to the sill are given a quarter of their code strength.

[Last time](2026-11-14-cyclic-loading-does-not-explain-decayed-shear-wall.md) we ran Weiss's cyclic protocol (CUREE) with pinching nails, and nothing moved. That nail model, SAWS, has no term for damage that builds up with cycles. Real nails do fatigue and tear out. So this step added the standard term.

- **The rule.** Each nail loses strength in proportion to the energy it has dissipated: s = 1 − E/E_t. This is the energy-based rule of Rahnama and Krawinkler (1993), as used in the Ibarra–Medina–Krawinkler deterioration model. We found no calibrated rate for nails in OSB this session, so we swept it. The rates run from none to one that costs a single nail 39% of its peak over the CUREE history.
- **What it does to intact walls.** Their cyclic peaks fall to about **97, 94, 85, 75 and 63%** of their one-way push as the rate rises.
- **What it does to decayed walls.** Their *share kept* goes **up**: by 0.3 to 2.9 points at code-strength joints, so the 3 in wall goes from 70.6% to 73.5%. With weak end nails the 6 in wall's share rises 10 points.
- **Why.** Damage follows dissipated energy. An intact wall works all its sheathing nails hard. A decayed wall's strength is set by its frame sliding on the end nails, so its sheathing nails do less and lose less. At the fastest rate the intact walls' nails keep 71–77% of their strength and the decayed walls' 86–96%.

We registered five predictions in the project log before running any wall. The three about walls held. Two code checks failed as written, and both are documented in the log. In one, the reference check forgot the rule's "strength never comes back" clamp; with the clamp the code agrees to 4×10⁻¹⁶. In the other, a one-way push turned out not to be entirely free of degradation. Inside a wall, most nails reverse slightly as their neighbours give way, so they start accumulating damage. That happens only after the peak, and it moves the peak by 0.00002 of a nail's strength.

The result rules out one explanation. Damage spread across the wall by energy scales intact and decayed walls together, and can only nudge the share kept up. Whatever took Weiss's wall to 34% must single out the decayed wall. The candidates are the few nails left along its unnailed bottom edge tearing out, the middle stud splitting (Weiss reports both), or end nails that are genuinely weak. The next step is a local failure model for edge nails, built from tested curves for nails at an unsupported panel edge, or a tested ultimate for 16d end-nailed joints. For the robot, nothing moves: a missed nail it does not catch still costs about 2–3% of a wall.

This is simulation only. The degradation rate is swept, not sourced. The nail parameters come from Anderson et al. (2007), whose 0.113 in nails are thinner than Weiss's 8d commons, so we compare only shares. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
