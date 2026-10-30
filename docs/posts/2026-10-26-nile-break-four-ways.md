---
title: "The Nile's 1898 dam break, found four ways"
date: 2026-10-26
description: "Four changepoint settings on the real Nile flow series all date the dam break to 1899; only the autocorrelation setting is honest that the date is less certain."
tags: [changepoint-detector, statistics, real-data]
---

[changepoint-detector](../../ventures/changepoint-detector/) already used the Nile series as its example. A new test now pins what happens on it under four settings: level change, level change allowing for autocorrelation (`--ar1`), level-and-volatility, and the robust version of that. All four return a single change at 1899, the first full year after the 1898 dam works (Cobb 1978), and every 95% range holds 1899.

The settings differ in how sure they are. Plain `mean` gives a range of 1897 to 1899 and 79% Bayesian probability. `--ar1` gives 1897 to 1901 and 50%, because flow in one year predicts the next, so fewer years are independent evidence. The date doesn't move; the confidence does. That is the behaviour you want from an autocorrelation allowance.

One series, one documented break: it shows the settings agree here, not that they agree everywhere. Statistical analysis of supplied data, not advice.
