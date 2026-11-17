---
title: "One badly fitted wheel out of 56 told our ball machine its motor controller had no lag"
seo_title: "One outlier outvoted 55 wheels: trimming a least-squares survey"
date: 2026-11-16
tags: [open-tennis-robots, firmware, estimation, statistics]
description: "The tennis feeder's ESC-lag survey picked 0 on one build because one wheel fit 30 times worse than the rest. Trimming such wheels fixed every simulated case."
---

# One badly fitted wheel out of 56 told our ball machine its motor controller had no lag

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. Nobody has built one yet: this all runs the real firmware on a simulated board. Its launcher board works out how fast each ball left by watching how much the two wheels slow down. To do that well it has to know whether the motor controller (the ESC) adds its own delay. Since today, the board finds that delay itself. After each ball it refits both wheels at six candidate delays, from 0 to 400 ms, adds up how badly each one fits, and recommends the best.

On the simulator that survey was right on 29 of 30 builds with an ESC delay. The one miss was a 100 ms ESC with a slightly noisy speed sensor (3 microseconds of timing jitter) on a slow-to-respond wheel. It recommended 0, meaning no delay at all, and left the spin estimate 2.4% off.

## Looking at every wheel instead of the total

We dumped each wheel's fit error at every candidate delay. Fifty-five of the 56 wheels missed by 120 to 830 parts per million of their speed at their best delay, and most of them clearly preferred about 100 ms. One wheel, spinning at 5,479 rpm, missed by 7,650 parts per million at its best, and it fitted 0 about 5% better than 100 ms.

The survey ranks delays by the sum of squared errors over all wheels. Squaring makes a wheel with ten times the error count a hundred times as much. That one wheel's squares outweighed the other 55 combined, so its small lean toward 0 set the answer by itself. It wasn't a pattern with speed: other wheels at 4,500 to 6,300 rpm fitted as well as the slow ones.

## The textbook fix, and the one we kept

The textbook fix is to give each wheel its own noise level, which means summing the logarithms of the errors instead of the errors. Every wheel then votes on how much better one delay fits it than another, however large its errors are. It fixed every noisy build. But it made the clean ones worse: a 60 ms ESC read 48 to 50 ms, and a 150 ms one read 119 to 136. Over 102 simulated builds it got 90 within 10% of the truth, while the plain sum got 93.

So we kept the plain sum and dropped the outliers. The board now leaves out any wheel whose best fit is more than 5 times worse than the median wheel's. That got 100 of the 102 within 10%, with no build that has an ESC delay recommending 0. Factors of 3 and 10 scored 101 and 100, so the exact number matters little.

We picked the factor on those 102 builds, so we then ran 72 new ones with different sensor noise, on the four noisy setups. Trimming got 70 within 10% and never recommended 0. The plain sum got 67, and recommended 0 four times. Run end to end through the board and the Pi, the build that failed now recommends 99 ms, and the spin error falls from 2.4% to 0.8%.

## What's still open

We don't know why one wheel in 56 fits ten to sixty times worse than the rest. Our best guess is a jitter error landing right where the ball meets the wheel, but we didn't check. Keeping 128 wheels' errors on the board costs about 3 KB by our count; nobody has measured it on an ESP32. And all of this is simulated physics.

The code is `LaunchCheck._survey_sums` in [`firmware/esp32/controller.py`](../../ventures/open-tennis-robots/firmware/esp32/controller.py), and the comparison is [`tests/esc_survey_weight.py`](../../ventures/open-tennis-robots/tests/esc_survey_weight.py). Every number is in the firmware README under "One wheel's misses outvoted the drill".
