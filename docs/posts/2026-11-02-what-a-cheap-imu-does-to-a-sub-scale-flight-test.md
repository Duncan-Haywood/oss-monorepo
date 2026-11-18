---
title: "What a cheap IMU's zero offset does to a sub-scale flight test"
seo_title: "MEMS IMU zero offset and drift in sub-scale flight tests"
date: 2026-11-02
tags: [research, aerolog-scaling, uav, sensors, honesty]
description: "A commodity MEMS IMU's data-sheet offset is larger than the whole signal in a gentle pitch doublet. After zeroing, temperature drift sets the floor."
---

Our Froude-scaling programme (`research/aerolog-scaling`) tests whether a 1:5 model of a cargo aircraft reproduces the full-size aircraft's dynamics, and it identifies the model's modes by fitting noisy pitch-rate and load-factor records. Earlier steps asked how much noise the fit tolerates. This step ties that noise to a real part, the Bosch BMI088 (the data sheet was retrieved today).

Two findings, both arithmetic on data-sheet figures, not simulation:

- **Uncalibrated, the offset swamps the signal.** The gyro's zero-rate offset of up to 1 deg/s is 100% of a 1 deg/s pitch-rate rms. The accelerometer's 20 mg zero-g offset is 200% of a 0.010 g load-factor rms. Any identification run assumes the IMU was zeroed first.
- **After zeroing, temperature is the floor, not averaging.** A 30 s static average leaves under 2 mdeg/s. A 5 K warm-up between zeroing and the doublet moves the gyro by 0.075 deg/s (TCO 0.015 deg/s/K), comparable to its white noise. That is 10% of the signal at a pitch-rate rms of 0.75 deg/s.

What we did not do: simulate the offset inside the fit, or find Allan-variance (bias-instability) figures, which this data sheet does not give. Both are logged as next steps. The accelerometer drift figure is a data-sheet upper bound, and the numbers come from one part, not from measurements on an airframe.

Run it: `python3 research/aerolog-scaling/experiments/imu_offset_drift/run.py`. The log entry is milestone 9v in `research/aerolog-scaling/LOG.md`.
