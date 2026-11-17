---
title: "The robust drones were the heavy ones"
date: 2026-11-14
tags: [codesign-cant, quadrotor, co-design, robustness, centre-of-pressure, thrust-to-weight, pre-registration]
seo_title: "Quadrotor gust robustness: mass beat thrust-to-weight"
description: "Trained across centre-of-pressure offsets, a co-designed quadrotor halved its gust crashes where fragile, by getting heavier, not by buying thrust."
---

The `codesign-cant` programme designs small quadrotors (frame, propellers, rotor cant and controller gains together) and then asks what breaks them. Its weak spot for the last few steps: if the centre of pressure sits twice as far from the centre of mass as the design assumed, gusts tip the vehicle over. The motors run out of differential thrust. A payload, a gimbal or a sensor pod can move the centre of pressure that far.

The last step found that letting the optimiser pick thrust-to-weight did not help. Trained at the normal lever, it spent the extra thrust on efficiency. So this step changed the objective instead. Every candidate design now flies at levers 0, 1 and 2 (six training flights each) and is scored on the average. We ran it twice, with thrust-to-weight fixed at 2 and free, six seeds each, for both rigid geometries. We wrote eight predictions down before the full run. All of it is simulated.

**Where the old designs were fragile, the crashes roughly halved.** With the centre of pressure below the centre of mass, crashes at twice the lever fell from 45 of 384 held-out flights to 20 (thrust-to-weight 2) and 14 (free). At three times the lever, which no design trained on, they fell from 159 to 87 and 86. At the normal lever the new designs are no worse.

**Where the old designs were already robust, nothing changed.** With the centre of pressure above, the old designs crashed on 4 of 384 flights at the doubled lever. The new ones crashed on 7 and 8. A crash rate near 1% gives six training flights per lever almost nothing to learn from.

**Thrust-to-weight was not what it bought.** The lever-aware optimiser picked thrust-to-weight 2.07 to 2.67, the same range as the one trained at a single lever, and the free arm did no better than the fixed one. It bought mass. In this sizing model a heavier vehicle at the same thrust-to-weight carries bigger motors and so more torque. The gust torque depends on the frame's area and the lever, not on its mass. We checked after reading the results: across all 24 designs per geometry, mass ranks with crashes at three times the lever at −0.87 and −0.94. Thrust-to-weight ranks at +0.08 and −0.02. One seed in each lever-aware run landed on a design of about 2 kg that hovered on twice the power and almost never crashed. The objective still charges for hover power, so most seeds stopped short of that.

**What it means for a builder.** If you don't know where your centre of pressure will be, compare the roll and pitch torque your motors can make with the torque a gust puts on your frame. Thrust-to-weight does not measure that. And a tuner only gets robust to what its objective covers: put the uncertain range into training.

**Limits.** The mass result is a correlation found after the fact, across designs that are not independent. The motor-mass and sizing fits are inherited assumptions, and the gust model makes gust torque independent of mass by construction. One simulator, six seeds, 64 held-out flights per condition. Of the eight predictions, three held (one only by a margin too small to mean anything) and five were refuted, one of them by a single flight.

The plan, predictions and every number are in the programme's [log](../../research/codesign-cant/LOG.md) and [README](../../research/codesign-cant/README.md).
