---
title: "Does allowing for autocorrelation hide a drifting season? On UK gas, yes"
seo_title: "Does allowing for autocorrelation hide a drifting season?"
date: 2026-10-29
tags: [changepoint-detector, time-series]
description: "The changepoint detector's --ar1 flag cuts false drift warnings on sticky noise. On real series it keeps the airline warning but loses UK gas."
---

The free changepoint detector warns when its many small steps look like one seasonal shape changing slowly rather than real regime changes. Earlier this week we found that autocorrelated noise alone can trigger that warning, and that `--ar1` cuts those false alarms on synthetic data.

The open question was whether `--ar1` also keeps the warning when a season really does drift. We ran it on five real series with `--trend bend`. On the airline-passengers series the warning stays (raw and log). On the fixed-season Nottingham temperatures it stays silent, as it should. On UK gas, whose season grows with its level, the warning disappears: the step count falls from 6 or 7 to 1, because the widened noise scale swallows the shape in a short quarterly series.

So `--ar1` trades false alarms for missed drift on short series. The README now says so, and the command and output are committed (`eval/drift-warning-real-ar1.mjs`). A way to widen the noise scale without losing a short shape is the next thing to try.
