---
title: "A slope-change test found a bend in the Nile. It was a step."
seo_title: "Step or slope change? A hinge test misreads the Nile's 1898 drop"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result, time-series]
description: "Pre-registered: a step-versus-bend check got the Nile right and failed on synthetic bends; the slope test refused 7 of 8 short real series."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a test for one change of slope, called the hinge test. It asks whether a single bend fits a series better than a straight line does. On annual global temperature it finds the mid-1970s acceleration with p 0.001. Its own notes have always said one thing it gets wrong: a level step on a trend can also make a straight line fit badly, and the test then reports that as a bend.

Today I measured how often that happens and tried a fix. I wrote both down before writing any code (`eval/hinge-step-or-bend-prereg-2026-11-15.md` in the repository).

**The Nile shows the problem.** The Nile's yearly flow at Aswan drops in 1898-99. Statisticians use it as the standard example of a level step. Given the series, the hinge test rejects the straight line at p 0.017 and puts its bend at 1913, with the slope going from -8 a year to flat. There was no bend in 1913.

**The fix tried.** Fit the best single step and the best single bend, each with three coefficients and one date, and report whichever leaves the smaller residual. On the Nile it says "step, after 1898", the documented date. On the four temperature records it says "bend". The real series came out as predicted.

**Synthetic data failed it.** Among series with a real step of 2 or 3 noise units that the test rejected, the check said "step" 85-99% of the time. Among series with a real bend at moderate autocorrelation, it said "step" more often than not (it named the kind right on only 44%). With 40 points after the bend and sticky noise, a ramp is fit about as well by a jump half-way along it. One of the two pre-registered bars failed, so the check does not ship. It stays in the code for evaluation. A plain least-squares version, which I tried only after seeing the result, did no better.

**What ships is a measurement.** A step of 2 noise units on a straight line makes the hinge test reject in 14-42% of synthetic series, against about 5% with no change at all. The report's note now says so, names the Nile, and asks the reader to run the step models too.

**The second finding hurt more.** I also predicted results on five real series the test had never seen: Australian gas, US electricity, the US female murder rate, Lake Huron and UK gas. Four predictions failed, and all four by the test refusing to run. Counting the three extra series I ran without a prediction, the test has now run on one of eight real series under 100 points. The rule behind the refusals is right: on short, sticky series a level test over-rejects, and the threshold was set to stop that. But it means that below 100 points the test rarely gets to answer. The page now says this, and the flagship's next step is to try a hinge on the log, or a second hinge, and check the false-alarm rate of each on fresh seeds first.

Everything is in the detector's README under "Step or bend?": the scripts, the outputs and both tables, including the rows that failed.
