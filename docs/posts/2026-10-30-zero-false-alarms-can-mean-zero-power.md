---
title: "Zero false alarms can mean zero power: changepoint detection on a cycle"
seo_title: "Zero false alarms can mean zero power in changepoint detection"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "On lynx and sunspot cycles the --ar1 option reports no false changes, and also finds none of 18 steps we added, even at two standard deviations."
---

A changepoint detector that is run on a series with a cycle, such as Canadian lynx trappings or sunspot numbers, reads each swing as a step: 23 false steps on lynx and 46 on sunspots with the default model. The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) already showed that `--ar1` and the bootstrapped `meanvar` penalty bring both to zero.

Zero is also what a tool that finds nothing reports. So we added a level shift of 0.5, 1 or 2 series standard deviations to the real data at three positions and counted how often each setup put a change within 3 points of it.

**The numbers.** `--ar1` found 0 of 18 inserted steps, including the 2 sd ones. The bootstrapped `meanvar` penalty found a 2 sd step in 6 of 6 cases but missed all 0.5 sd steps and 1 sd steps on sunspots. The default model found the step and 20 to 46 false ones with it. A 20-point minimum segment found most steps and left 2 to 7 extras.

**What to do.** On a visibly cyclic series, use `meanvar --bootstrap` for a large break, and treat `--ar1` as a false-alarm filter, not a confirmation. Each cell is 3 trials on two series, and a step added to real data is not a real step. Details and the test are in the README.
