---
title: "Audio sync of cameras: noise both cameras hear is signal, until they are 11 m apart"
seo_title: "Audio sync of cameras: shared noise is signal within 11 m"
date: 2026-11-17
description: "A shared noise source cut missed frames from 59-64% to 0% in 242,000 simulated windows. At 30 m apart, the talker's own travel time costs the frame."
tags: [research, capture-sync, audio-sync, multi-camera]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of sound can sync two free-running cameras or phones to within one video frame. Its earlier steps added noise separately at each device, and under that loud noise most confidence gates broke. This step tries the case a real room gives you: one air conditioner, one crowd or one door, heard by both devices.

The geometry settles part of it before any simulation. Take two devices D metres apart. Any sound reaches the two of them at times that differ by at most D divided by the speed of sound. So a correlation peak on any sound both devices hear, whether speech or noise, sits within D/c of the true clock offset. One 30 fps frame is 33.3 ms, which is 11.4 m of sound travel. When the devices are closer than that, locking onto shared noise cannot cost a frame. At 60 fps the limit is 5.7 m.

The simulation covers how often the correlation actually follows the noise, and what the confidence gate makes of it. Step 3c's 62,000 windows were replayed exactly, and 180,000 shared-noise windows were added on the same clean speech. The devices were 3, 10 or 30 m apart, the talker and the noise source were placed at random, and the rooms were statistical with RT60 0.2 and 0.8 s. There were ten kinds of noise at +10, 0 and -10 dB, and every error was scored against the clock. Results for 2 s windows with partial whitening at -10 dB:

- **Inside the limit, shared noise helps.** With independent babble at each device, 59-64% of windows miss a frame. With one babble source heard by both, 0% miss. For 8 of 10 noise types the estimate lands within 2 ms of the noise source's own lag, which inside the limit is still a right answer. The confidence gate keeps 60-63% of windows instead of 23-24%.
- **Sound that repeats breaks it.** Three of the corpus's door-slam recordings are loops with periods of 0.53 to 1.52 s, so the correlation has several equal peaks. 24-27% of windows miss, and a gate calibrated without shared noise lets 19-20% wrong windows through. Calibrating on the rig's own shared noise cut this to 3-13% at 3 m, mostly by refusing windows.
- **Past the limit, geometry sets the floor, not noise.** At 30 m the talker's own path difference is more than a frame in 69% of layouts. About 70% of windows therefore miss at every noise level, +10 dB included, and the gate correctly refuses all of them. A widely spread rig needs a clap made the same distance from every camera, or a correction from their known positions.

Six of the eight predictions written before the run failed or held only in part, and the log says which. Prediction (d) expected shared noise to do worse than independent noise at 30 m. It didn't, because both fail at the same rate, set by where the talker stands. The model is free-field and the rooms are statistical. Each run used fully shared or fully independent noise, never a mix, and the door result depends on looped corpus files. The [README](../../research/capture-sync/README.md) has the full table and [LOG.md](../../research/capture-sync/LOG.md) has the predictions.
