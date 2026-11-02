---
title: "How loud is 10% sensor noise, for a real IMU?"
seo_title: "Is 10% sensor noise realistic for a drone IMU? A datasheet check"
date: 2026-11-02
tags: [research, aerolog-scaling, system-identification, imu]
description: "Our scale-model identification tests add noise equal to 10% of each signal. A Bosch BMI088 datasheet says what that means in degrees per second."
---

Our scale-model flight-test study (`research/aerolog-scaling`) asks whether a one-fifth-scale model's handling can be identified from a short logged flight. Every test since milestone 9j adds noise equal to 10% of each signal's rms. Nobody had tied that 10% to hardware, so today's step did.

The Bosch BMI088 datasheet gives a gyro noise density of 0.014 deg/s/√Hz and an accelerometer density of 190 µg/√Hz. Sampled at one twentieth of the short-period time (0.4 to 2.5 s for the model), the gyro adds 0.03 to 0.07 deg/s rms. That equals 10% of the signal only when the pitch-rate rms is 0.3 to 0.7 deg/s. A doublet with a few deg/s rms sees about 2% or less.

So 10% is conservative for white IMU noise. It says nothing about bias drift, which is the coloured-noise case where the identification loses accuracy (keep the 1.5x gust margin), or about the air-data channels, whose noise is not in this datasheet. The arithmetic is in `experiments/imu_noise_density/`; the limits are the datasheet's typical values, no vibration or filter model, and no flight data.
