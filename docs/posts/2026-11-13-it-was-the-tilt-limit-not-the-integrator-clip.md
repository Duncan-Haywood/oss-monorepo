---
title: "Our guess about why an unstable quadrotor loop stayed bounded was wrong: it was the tilt limit"
date: 2026-11-13
tags: [codesign-cant, quadrotor, stability, saturation, feed-forward, pid, research]
description: "Simulated quadrotors a linear model calls unstable never diverged. Not the integrator clip: the 20° tilt limit held them; at 45°, 83% of flights diverge."
seo_title: "Why an unstable quadrotor controller stays bounded: the tilt limit"
---

[The last step](2026-11-13-a-linear-test-that-catches-every-quadrotor-divergence-but-flags-too-many.md) ended on a guess. A linear model of a canted quadrotor's control loop called almost every flight of some designs unstable. Those designs had their integral gain set to 1.25 times the model's stability ceiling. Yet none of their 384 simulated flights diverged. We guessed the attitude integrator's clip was capping the feed-forward, and said we had not tested it.

This step tested it, along with a second explanation: maybe the instability was too slow for a 6 s flight. We added three switches to the simulator that leave the default run unchanged bit for bit: remove the integrator clip, remove the feed-forward's own clip, and fly for 18 s instead of 6. The simulator now also records how often each saturation is active. Eight predictions went into the log first.

**The integrator clip is never reached.** In all 24 designs, under every setting, the attitude integrator sat at its clip on 0.000 of the time steps. Removing the clip changed no divergence count at all. Our guess was wrong.

**Flight length does not explain it either.** Iterated from each flight's starting offset alone, the linear model takes 60% of those flights past 5 m or 60° of tilt within 6 s, and 87% within 18 s. In the simulator, none of them diverged in 6 s flights or in 18 s ones. Their median position error even fell from 0.110 to 0.084 m over the longer flights.

**One saturation was active: the tilt command.** The position loop asks for a tilt, and the simulator caps that request at 20°. The cap was hit on 13 to 24% of the steps of the 1.25× designs, and on under 3% for the stable designs. After seeing that, we ran a sweep we had not planned, so it is exploratory. With the cap raised to 30, 45 and 59°, the 1.25× designs' 18 s flights diverged 2%, 83% and 88% of the time. The linear model had called 96% of them unstable. Designs bolted onto an existing tune went from 22% diverged at 20° to every flight at 45°. At 20° the 1.25× designs hold position, but their tilt tracking error is 8.7 to 10° against 2.6 to 3.6° for stable ones. They are oscillating against the limit rather than settling.

**What a builder can take from it.** Most of the linear test's false alarms were real instabilities that the tilt limit happened to contain. In our simulator, the rule from the last step was the only setting that survived every limit we tried: keep the integral gain at about 0.8 times its linear ceiling. Designs the optimiser tuned right onto the ceiling lost 3 to 4% of flights once the limit went to 45°. Aggressive and racing position modes run looser tilt limits than 20°, so a controller that looks safe in a gentle mode may not be safe in those.

Everything here is simulated: one frame geometry, six designs per group, assumed plant ranges, and a sweep chosen after the first results. The scripts, results and log are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/) (`experiments/m7d_clip/`). The next step is to predict the size of the oscillation the limit contains, with a describing function, so that "bounded" becomes a number.
