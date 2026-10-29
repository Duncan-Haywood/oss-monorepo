---
title: "Telling a growing season from a real shock: a third try that mostly failed"
date: 2026-10-29
description: "Refitting on the log clears one growing seasonal series but not the airline one, so the changepoint drift warning stays as it is."
tags: [changepoint-detector, negative-result, time-series]
---

Our changepoint detector warns when its detected changes cluster like a seasonal shape that is still changing rather than real regime changes. The warning is right on three series whose season grows (airline passengers, UK gas, J&J earnings) and wrong on one: UK driver deaths, where the 1973 fuel-crisis dip and rebound are genuine.

We have now tried three automatic ways to tell the two apart. Netting the shifts out failed. Refitting with a level-scaled season separated only UK gas. Today's try took logs first, so a growing season has a fixed size. It cleared UK gas (15 steps down to 5), thinned J&J, left the airline series with 3 steps in the window (11 with no trend), and kept the shock's steps, exactly as it should. One of three shapes called right is not a rule, so the warning text is unchanged and still tells you to check the dates against your series.

What would settle it is a second real seasonal series with a documented shock inside it. The script, its output and a test that reruns it are in `ventures/changepoint-detector/eval/`.
