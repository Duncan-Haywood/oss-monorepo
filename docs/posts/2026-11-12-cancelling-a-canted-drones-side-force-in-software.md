---
title: "Cancelling a canted drone's side force in software evens the axes, and adds a rare crash"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, feed-forward, position-control, research]
description: A position-loop feed-forward that leans against a canted quadrotor's own side force removed the one-axis penalty, but a fast filter made a few held-out flights diverge.
seo_title: "Can a flight controller cancel the side force of canted quadrotor motors?"
---

Tilt each motor of a quadrotor by about 30° around its arm and you get much more yaw authority. The `codesign-cant` programme has found that all day, and it held again here. The catch, found in the last step, is a side force. Whenever the attitude controller makes roll or pitch torque, the tilted thrusts stop cancelling and push the body sideways. On a rigid frame, the steady counter-torque to a gust then pushes *with* the wind on one horizontal axis. After a wind step, that axis held position 1.9 to 3.4 times worse than the other.

The mixer cannot fix this. Four rotors give four commands, and the side force is fixed by the torque. But the flight controller knows everything needed to predict it: the cant geometry, the torque it just commanded, and its motors' nominal lag. So this step tried the obvious fix. The position loop predicts the side force and tilts the vehicle slightly against it. No new sensor is needed, and the change is a few lines of flight code.

We retrained the co-designed vehicles with that feed-forward in the loop, letting the optimiser choose its filter constant, and wrote seven predictions into the log first.

**It works on the problem it was aimed at.** The ratio of error on the hurt axis to the helped axis fell from 1.91 and 3.41 (centre of pressure above and below the centre of mass) to 1.08 and 1.10. Switching the feed-forward off on the same designs brought the split straight back, so the controller term did the work, not a different airframe.

**It does not pay overall.** The feed-forward feeds the commanded torque back into the attitude reference, through the motor lag, on a plant whose lag and torque the controller only knows nominally. That loop can go unstable. Added to the previous step's designs, a 0.2 s filter made 16% of held-out flights diverge, against 0.5% without the feed-forward. A 1 s filter brought that to 1.3%. When retrained, two of six designs chose fast filters. Each diverged on 4 of 64 held-out flights, and its 16 training flights had not shown the optimiser that tail. With the centre of pressure above the centre of mass, the feed-forward was a wash. Below it, the composite score got worse.

The typical design still barely noticed the side force: the median position cost was 1 to 2%. Cant still beat upright motors by 5 to 7° of yaw error in every seed.

For anyone building one: if you add this feed-forward, filter it slowly (a second or more). What it buys is about a centimetre of error on one axis. The next step is to feed forward only the attitude integrator's state, which is the controller's own estimate of the steady gust torque, so no fast loop closes. All of this is simulated, with an assumed centre-of-pressure lever and six seeds. Code, results and the predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
