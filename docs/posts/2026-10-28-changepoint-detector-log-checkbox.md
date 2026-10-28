---
title: "Changepoint detector: a log checkbox for growth series"
date: 2026-10-28
description: "A steadily growing series looks like a staircase to a changepoint tool. The page now has the log option the command line had."
tags: [changepoint-detector, statistics]
---

On Johnson & Johnson's quarterly earnings, 1960 to 1980, the raw series gives
12 to 16 "changes", all up-steps, because a growth curve is not a staircase.
Logged, with a trend, it gives 5. The `--log` option did this on the command
line and in the engine; the web page now has the same checkbox ("Take natural
logs first"). Each change then also shows its ratio, so a move reads as "x1.3",
not "+0.26". It is ignored for the counts model, which already works on a log
rate. Details are in the project README.
