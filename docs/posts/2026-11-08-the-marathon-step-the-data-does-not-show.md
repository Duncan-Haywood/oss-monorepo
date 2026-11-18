---
title: "The Marathon Step the Data Does Not Show: a documented change that changepoint detection should not find"
seo_title: "Boston Marathon Changepoint Test: A Documented Step That Is Invisible"
date: 2026-11-08
tags: [changepoint-detector, time-series, real-data]
description: "We tried the Boston Marathon's 1924 course lengthening as a test for the changepoint detector. The winning times show no step, so no model finds one."
---

Changepoint tools are easiest to trust when a real series has a documented break and the tool dates it. For the [changepoint detector](/ventures/changepoint-detector/) we wanted one inside a long smooth series, and the Boston Marathon looked like a candidate: the course grew from about 24.5 miles to the full 26.2 in 1924 (recalled from the race's history, not re-read).

The winning times for 1897 to 2016 (120 values) do not show it. The mean is 153.0 minutes before 1924 and 152.2 after, because better runners offset the longer course. None of four models (default, level with AR(1) errors, trend, mean and variance) dates a change at 1924. They report 5 to 9 changes elsewhere, with 1953 and 1978 in all four, and nothing in the data says what those were.

So it is a negative result and stays unscored. A useful check needs a documented step whose size shows in the series. The data, script and test are in the venture's README under "Boston Marathon".
