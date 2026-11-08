---
title: "Three real shocks in Japanese visitor numbers, and which change-point models see them"
date: 2026-11-08
tags: [changepoint-detector, time-series, evaluation]
description: "Quarterly arrivals to Australia from Japan contain the Asian crisis, SARS and the 2008 crash. No single model in the detector dates all three."
---

We ran the change-point detector on quarterly visitor arrivals to Australia from Japan, 1981 to 2012. The series has three shocks with known causes: the Asian financial crisis (1997-98), SARS (2003) and the 2008-09 crash.

The default level model cuts twelve times, and three of the cuts fall on 1998Q4, 2003Q2 and 2009Q1. The trend model cuts four times and finds SARS and 2008 but not 1998. The mean-and-variance model and the autocorrelation correction both find 1998 and 2008 and lose SARS, a two-quarter dip that they read as noise.

So the models that stop over-cutting also absorb short, real events. That is the same trade seen with Australian cement and the 2000 GST. Limits: one series, event dates recalled rather than read from a source, no significance test run on these cuts. The test is `au-arrivals-japan.test.mjs` and the write-up is in the venture README.
