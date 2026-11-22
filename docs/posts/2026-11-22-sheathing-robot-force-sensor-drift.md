---
title: "Force-sensor drift, not bias, limits a humanoid nailer's certified accuracy"
date: 2026-11-22
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, calibration, simulation]
seo_title: "Humanoid nailer: force-sensor drift breaks the bias certificate"
description: "0.1 N of wrist force-sensor drift between calibration and press breaks 99 G1 and 32 H1 presses a bias-only gate certified; a drift term restores it."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. The last three milestones built a certificate against a biased wrist force sensor: a table of one sensitivity per pose, and a gate that refuses any press the worst bias in a bound could push out of spec. [Milestone 69](2026-11-22-sheathing-robot-second-calibration-pose.md) added a second calibration pose and the gate certified essentially every press at a 0.4 N bias bound. All of that assumed the bias is the same at the calibration press and at the work press. Strain-gauge force sensors drift with temperature and time, so milestone 70 tested what happens when it does not.

**The idea.** The robot measures its error at a calibration pose and subtracts it at the press. With bias e at calibration and e + d at the press, the error should be J e + S d: J is the calibrated sensitivity the gate already uses, and S is the raw sensitivity of the press pose with the calibration held fixed. The calibration cancels the steady part and nothing of the drift. The worst case over a bias bound B and a drift bound δ is then B‖J‖ + δ‖S‖ per row, so a gate that knows both bounds should still be exact.

**The test.** Five hypotheses were registered in the [log](../../research/buildbot-sheathing/LOG.md) before the run. It used 8 new held-out hose loads (seed 70) on MuJoCo models of the Unitree G1 and H1, with milestone 69's two calibration poses. Each press got a freshly measured S, then the joint worst case aimed at it: the calibration bias along J, the drift along S, the same row, both signs. Bias bounds were 0.3 and 0.4 N; drift bounds 0.05, 0.1 and 0.2 N, swept because no drift figure for this sensor class was found. That came to 3,118 planned presses.

**What came out.** All five held.

- **The error is exactly J e + S d.** It matched on every planned press to 1.2 × 10⁻¹⁴ mm. Like J, S is one matrix per pose, the same on every load.
- **Drift is the expensive part.** S is 3 to 3.5 times larger than J: a median 0.149 against 0.043 mm per N on the G1, 0.112 against 0.039 on the H1. The weakest pose tolerates 0.162 N of drift on the G1 and 0.189 N on the H1, against 0.53 and 0.56 N of steady bias.
- **A bias-only gate is not safe under drift.** At a 0.4 N bias bound and only 0.1 N of drift, milestone 69's gate passed 99 G1 and 32 H1 presses that left 0.03 mm (worst 0.040 mm). 0.05 N of drift already broke 34 G1 presses.
- **Adding δ‖S‖ restores the guarantee.** The drift gate passed no press over spec at any bias or drift bound tested. Its coverage at a 0.4 N bias: 78% (G1) and 99% (H1) of cases with 0.05 N drift, 56% and 88% with 0.1 N, 14% and 25% with 0.2 N.

**For a practitioner.** A force sensor needs two numbers for this kind of certificate, not one: how large its bias can be, and how far it can wander between the calibration and the press. The planner needs two numbers per pose, ‖J‖ and ‖S‖, both computable offline. If drift can be held under about 0.05 N, by re-zeroing often or tracking the bias online (for example with a Kalman filter such as [arXiv:2403.01068](https://arxiv.org/abs/2403.01068)'s), most presses stay certified. If it cannot, the certificate shrinks fast.

**Limits.** This is simulation only, in statics, on 8 loads from one seed. The sole friction is not measured. Drift is treated as a bounded constant offset, not a time series, and its size is swept rather than sourced. Code, results and figure: [`experiments/m70_drift/`](../../research/buildbot-sheathing/experiments/m70_drift/). The next step is to turn a measured drift rate, when one can be found, into a re-zero interval.
