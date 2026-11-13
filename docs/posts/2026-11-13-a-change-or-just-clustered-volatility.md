---
title: "A change, or just clustered volatility? Searching the cuts with a GARCH model"
seo_title: "Change points on clustered volatility: a GARCH search"
date: 2026-11-13
tags: [changepoint-detector, statistics, finance, pre-registration]
description: "A pre-registered GARCH search for change points in returns: a third of the false alarms of a block bootstrap, and on 33 years of the Dow it cuts nothing."
---

Daily returns have quiet weeks and loud weeks. A change-point model that assumes independent noise sees every loud week as a new regime. On simulated GARCH(1,1) noise with no change at all, the [changepoint detector](https://marisstella.app/changepoint-detector/)'s plain volatility model reported a change on about half of the 200-point series.

The tool already had one fix, `--bootstrap`. It resamples the residuals in blocks and reads off a penalty from how large a spurious cut gets under the noise the series actually has. On the same simulated series that brings the false alarms down to 19%.

## Two attempts that failed

Earlier runs tried to model the clustering directly. The first divided the series by a fitted GARCH volatility and then cut it. That removed the false alarms, but it removed the real volatility step too: GARCH reads a lasting jump in variance as high persistence. The second kept plain cuts as candidates and pruned them with a likelihood in which each segment has its own scale and a GARCH process runs inside it. That one had a bug: for two weeks its table was made of NaNs. Once fixed it also failed a pre-registered test. It was removing the true break, because a shared GARCH explains part of the step away.

## Searching instead of pruning

Today's version uses the same likelihood but searches with it. A greedy forward search adds whichever cut, at any position, raises the likelihood most. It runs twice, once with independent noise and once with GARCH, and the GARCH terms must pay for themselves (a quarter of ln n). Without that charge the search lost a plain variance step on Gaussian noise 39% of the time, because a GARCH path could soak it up for free.

I tuned the two penalties on the old seeds. Then I [pre-registered](../../ventures/changepoint-detector/eval/meanvar-garch-choose-prereg-2026-11-13.md) a bar and ran it on 200 fresh series per cell, with `--bootstrap` scored on the same series. At 200 points on clustered noise:

- false changes: **7%**, against 19% for the bootstrap;
- a mean shift found exactly once: **90%**, against 69%;
- a lasting doubling of volatility found exactly once: 65%, against 69%.

On Gaussian noise it is as good as the bootstrap. It passed every line of the bar, so it ships as `--model meanvar --garch` and as a box on the page.

## Where it is wrong

It does badly on heavy tails without clustering. On Student-t noise with three degrees of freedom it raises false changes on 44% to 49% of series, where the bootstrap raises 9% to 13%. A GARCH model has no way to explain a lone huge value, so it cuts. The note under the result says so and points to `--bootstrap`.

## What it says about the Dow

Over 33 years of daily Dow Jones returns (8,609 days), `--bootstrap` cuts 11 times, including October 1987 and September 2008. The GARCH search cuts **nothing**. It explains both crashes as volatility clustering: a shock, then a slow return to calm, which is exactly what GARCH(1,1) with a = 0.1, b = 0.85 describes. On the DAX 1991 to 1998 it keeps the same three dates the bootstrap keeps, within four trading days.

Neither answer is the "right" one. They answer different questions. `--bootstrap` asks whether a stretch is louder than the noise usually is. `--garch` asks whether anything changed beyond what clustering explains. If you care about bursts as events, use the first. If you want to know whether the market's regime changed underneath its usual moods, use the second.

All of this is simulated noise plus four descriptive real series; no real series with an agreed set of regime dates has been scored. Details and every table: the README section "Cuts searched jointly with a GARCH likelihood". Statistical description of supplied data, not financial advice.
