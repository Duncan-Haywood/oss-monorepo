---
title: "How long can a humanoid nailer wait after re-zeroing its force sensor? An exact per-pose answer"
date: 2026-11-23
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, calibration, simulation]
seo_title: "Humanoid nailer: an exact force-sensor drift allowance per pose"
description: "Two frozen tables give each press an exact drift allowance: at 0.9 times it no press of 504 leaves spec, at 1.1 times all 503 do. Weakest pose: 0.041 N."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can hold a nailer against a sheathed wall and land each press within 0.03 mm of where its model says. [Milestone 70](2026-11-22-sheathing-robot-force-sensor-drift.md) found that a wrist force sensor's bias drifting between calibration and press costs 3 to 3.5 times as much as a steady bias, and that a gate carrying a drift term restores the guarantee. That left a practical question: how long may the robot wait after re-zeroing the sensor?

**The idea.** The press error is exactly J e + S d, with e the bias at calibration, d the drift since then, and J and S one matrix per pose. If both matrices can be frozen into tables, the gate needs no measurement at press time. Read backwards, it gives each press a drift allowance: the largest drift that still keeps every row of the error under 0.03 mm. Divide that by the sensor's drift rate and you have the longest wait after a re-zero.

**The test.** Five hypotheses were registered in the [log](../../research/buildbot-sheathing/LOG.md) before the run. It used 8 new held-out hose loads (seed 71) on MuJoCo models of the Unitree G1 and H1, a 0.4 N bias bound, and the two frozen tables. Each press got its allowance from the tables alone and was then pressed at 0.9 times, 1.1 times and a fixed 0.1 N of drift, with the bias and drift aimed at the worst row, both signs.

**What came out.** All five held.

- **Frozen tables work.** They predicted every one of 1,592 planned presses to 1.3 × 10⁻¹⁴ mm, and the frozen drift gate passed no press over spec.
- **The allowance is exact.** Just under it (0.9 times), none of 504 presses left 0.03 mm. Just over it (1.1 times), all 503 did.
- **It is one number per pose.** The median is 0.102 N on the G1 and 0.147 N on the H1. The weakest poses are the G1's top-height ones (0.041 N) and the H1's lowest (0.091 N).
- **Re-zero intervals.** At a drift rate of 0.1 N per hour, the weakest pose needs a re-zero every 25 minutes on the G1 and 55 minutes on the H1. At 0.5 N per hour that drops to 5 and 11 minutes. The rates are swept because no drift figure for this class of sensor could be found.

**A side result.** The calibration pose only changes the bias term. The drift term depends on the press pose alone, so no choice of calibration pose can reduce it. Re-zeroing, or tracking the bias online, is the only thing that acts on drift.

**For a practitioner.** Ship two tables per robot and certify every press offline. Schedule re-zeros per pose: the pose's allowance divided by your sensor's drift rate is the longest a press there may wait.

**Limits.** This is simulation only, in statics, on 8 loads from one seed, at one bias bound. The drift rate is swept, not sourced, and drift is assumed to grow linearly with time since the last re-zero. Code, results and figure: [`experiments/m71_allowance/`](../../research/buildbot-sheathing/experiments/m71_allowance/).
