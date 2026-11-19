---
title: "Why a tuned drone stops 5 cm short of its set point: the integrator's slow pole, and a fix with no crash cost"
seo_title: "Why a quadrotor PID stops short of its set point, and the fix"
date: 2026-11-19
tags: [research, robotics, drones, quadrotor, pid, control]
description: "One in four auto-tuned simulated quadrotors ends a 1 m step 5-8 cm short. A three-state position-loop model predicts which; gating the integrator fixes it."
---

Our [rotor-cant co-design programme](../../research/codesign-cant/README.md) tunes a simulated 5-inch quadrotor's arm, propeller, cant angle and controller gains together with CMA-ES. [This morning's paper step](2026-11-19-randomise-drone-motor-lag-from-the-slow-end.md) settled how wide the motor-lag training range should be. One problem was left open. In every training range, one to five of the twelve tuned vehicles never finish a 1 m position step. They stop 5 to 8 cm from the hold point and hover there for the rest of the 6 s flight. The draft said a settle-time term belonged in the objective. This run looked for the cause first.

## Not the motor, not the gain

The obvious suspects were the motor lag, which the whole series had been about, and a soft position gain. Neither fits. The unsettled designs' position gains cover the same range as the settled ones. What separates them is the ratio of the position loop's integral gain to its proportional gain, ki/kp. All 18 unsettled designs among the 72 we had step-tested had ki/kp of 0.066 s⁻¹ or more. All but one of the 54 settled ones sat below 0.070.

That points to a textbook mechanism. A PID position loop on a vehicle that behaves like a double integrator has the characteristic polynomial s³ + kd s² + kp s + ki. When ki is small, one root sits near −ki/kp. The integrator stores error during the approach, and that stored error then bleeds out on that slow root, over about kp/ki seconds. With ki/kp around 0.1 s⁻¹, that is ten seconds, longer than the flight. The tail is largest on a 6 s flight near ki/kp ≈ 1/6 s⁻¹.

Why would a tuner pick such gains? It trains on gusts around a 3 m/s mean wind, where integral action pays because it cancels the steady drag. It never sees a set-point step, so nothing pushes back.

## A three-state model calls it exactly

If that is the whole story, the attitude loop, the motors and the rotor-cant side force should not matter. So we wrote a [three-state model of the outer loop alone](../../research/codesign-cant/experiments/m7ad_settle/model.py). It keeps only the PID, the cap on the proportional request, the tilt limit as an acceleration bound and the integrator clip. We committed eight predictions before running the full simulator. Then we flew a 1 m step, 64 episodes each, on 96 tuned designs that had never been step-tested.

- The model and the simulator agreed on which designs never settle for **96 of 96** (15 unsettled).
- Their last-second distances from the hold point correlate at **r = 0.9995**.
- The call was the same at all three published motor-lag values (33, 36 and 39.1 ms) for all 96.

The motor plays no part. A builder can check a tune for this with a few lines of numpy before flying it.

## Conditional integration fixes it

The standard remedy for a winding-up integrator is conditional integration: run the integrator only near the set point. We changed nothing else, retuned nothing, and gated the position integrator at 0.25 m of error on the 72 designs from the training-range study:

| integrator | unsettled (of 72) | median overshoot | median rise to 90% | stress crashes, identified lags |
|---|---|---|---|---|
| always on | 18 | 5.1 cm | 1.74 s | 820 |
| on within 0.25 m | **0** | **2.0 cm** | 1.91 s | 819 |
| on within 0.10 m | 0 | 1.6 cm | 1.91 s | 814 |

The wind-step tests did not move, because in them the error never leaves the band. The stress test, which counts crashes over 147,456 flights (72 designs, eight motor laws, four conditions, 64 episodes), did not move either (paired p = 0.89). The price is rise time, about 10%: once the integrator stops winding up on the way in, only the proportional gain pulls the vehicle toward the set point. We had predicted the tighter band would cost more crashes. It did not, and that prediction was the only one of the eight that failed.

![Left: distance from the hold point in the last second of a 1 m step against ki/kp: with the integrator always on it climbs past 5 cm above about 0.07; with conditional integration every design stays near 1 cm. Right: the three-state model's prediction against the full simulator, all on the diagonal.](../../research/codesign-cant/experiments/m7ad_settle/m7ad_settle.png)

## What it means for the paper and for builders

Section VII of the [draft](../../research/codesign-cant/paper/DRAFT.md) now gives the cause and the fix. With the integrator gated, the 125 ms training ceiling the section recommends no longer has unsettled designs. That slow final approach was the main thing holding it back.

For anyone tuning a multirotor position loop: if it has integral action, gate it near the set point. If you tune automatically against disturbances alone, also check ki/kp. On a short horizon, values near the inverse of the flight time leave a visible tail.

**Limits.** Everything here is simulated. The fix was applied after training, not trained with, so the tuner might buy back some rise time if it saw the gate (most likely with a higher kp). Neither band width is sourced. The step tests are in calm air at one centre-of-pressure lever with one evaluation seed. The full numbers, the tests and the run log are in [`verdicts.txt`](../../research/codesign-cant/experiments/m7ad_settle/verdicts.txt) and the programme's [LOG](../../research/codesign-cant/LOG.md). This post was written with AI assistance (Claude Code).
