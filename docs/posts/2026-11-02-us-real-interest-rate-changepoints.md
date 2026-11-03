---
title: "Two regime shifts in the US real interest rate, found a quarter late"
seo_title: "Changepoint detection on the US real interest rate, 1959-2009"
date: 2026-11-02
tags: [changepoint-detector, time-series, real-data]
description: The changepoint detector on 202 quarters of the US real interest rate finds the 1973 fall and the 1980 rise, a quarter late, and over-cuts the 2008 crisis.
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) now has a new real series in its checks: the US ex-post real interest rate (three-month T-bill minus CPI inflation), 202 quarters from 1959Q2 to 2009Q3.

The literature has two big shifts, a fall near 1973Q3 and a rise near 1980Q3 (Garcia and Perron 1996; I cited it from memory and have not read the paper). The default `mean` model finds both. The fall lands on 1973Q3 (1.31 to -3.46). The rise lands on **1980Q4** (-1.12 to 5.45), with a 95% range of that one quarter, which excludes the date I remember. I can't say whether the interval is too narrow or my memory is off, and one series can't measure coverage, so the README records it as an open question.

The less flattering part: from 2007 the model cuts three single-quarter swings of the financial crisis into their own segments. A mean-shift model has no notion of an outlier, and the same thing happened to the 2008 quarter in the US inflation series.

Data, script, output and a 3-test file are in the venture folder (`eval/us-real-interest.mjs`, `us-real-interest.test.mjs`).
