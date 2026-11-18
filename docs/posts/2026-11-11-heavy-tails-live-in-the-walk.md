---
title: "A robust loss that made our changepoint detector worse, and why"
seo_title: "Robust changepoint loss on a random walk: a negative result"
date: 2026-11-11
tags: [changepoint-detector, time-series, robust-statistics, negative-result]
description: "A biweight loss cut false changepoints on heavy-tailed synthetic noise, then nearly doubled them on bank and bitcoin prices: the tails are in the walk."
---

Our [changepoint detector](/ventures/changepoint-detector/README.md) has a
model for series whose level wanders between changes: a random walk plus
noise, where only a jump too big for the walk counts as a change. On the
Turing Change Point Dataset it handles smooth series well. It takes US
population from 406 cuts to none. But it still cut a bank's stock price 63
times where annotators marked no change, and bitcoin 52 times.

Both series look heavy-tailed, and the textbook fix for heavy tails is a
robust loss. A bounded "biweight" loss caps what any one point can cost,
following Fearnhead and Rigaill's 2019 paper on changepoints with outliers.
We put it inside the model's Kalman filter. Past three standard deviations a
point costs a flat amount and does not move the level.

**On synthetic data it worked.** We added Student-t noise with three degrees of
freedom and no step. The plain model reported 1.58 false changes a series and
the biweight 0.03. A real three-sd step was found 60 times out of 60. On
ordinary Gaussian noise nothing was lost.

**On real data it failed.** We wrote the decision rule down before scoring any
real series: adopt the loss only if it beats the current model on both the 31
public and the 7 held-out series. It lost on both: F1 0.681 against 0.694, and
0.448 against 0.527. On the series it was aimed at it did worse. The bank went
from 63 cuts to 111 and bitcoin from 52 to 98. So we are not shipping it.

**Why it failed.** The fitted model says what kind of series these are. It
compares how much the level wanders with the noise around it. On the Nile that
ratio is 0.00006, mostly noise. On the bank it is 6,400 and on bitcoin 4,100,
so the model treats them as almost pure random walks. Their big moves are not
noisy readings around a steady level. They are big steps of the level itself.
A bounded loss on the reading refuses to follow such a step. The level is left
behind, every later point looks like an outlier, and only a new change can
catch it up. The robust loss was robust in the wrong place.

That points to the next try. The heavy tail belongs in the walk's steps. A
second option is a plain warning when the model sees a near-pure random walk:
"these jumps are its largest steps." The milder Huber loss edged past the
current model on both sets, but it was a side row in the pre-registered run
and the gap is inside the noise. It is a lead for fresh labelled data, not a
result.

The code, the synthetic check, the pre-registered script and its output are
in the [README section](/ventures/changepoint-detector/README.md)
"Heavy tails on a drifting level". This is statistical analysis, not advice.
