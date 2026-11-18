---
title: "A changepoint tool dates the Crimean War's sanitary fall to the month"
date: 2026-11-08
tags: [changepoint-detector, statistics, history, open-source]
description: "On Nightingale's 24 monthly disease death rates, PELT places the fall at March 1855, the month the Sanitary Commission arrived."
---

We ran the open-source changepoint detector on a real series with a dated cause: British army deaths from disease in the Crimea, April 1854 to March 1856, 24 monthly points. The Sanitary Commission arrived in March 1855.

With a level model and a minimum segment of 3, PELT puts a fall at 1855-03, from about 826 to 269 deaths per 1,000 a year, with 80% Bayesian probability within three points. In logs it dates the fall one month later and reports the three cuts after the peak as a single fall from 6.57 to 1.89, which is the honest reading: the decline is a ramp.

Limits: 24 points and one series. Winter ended around then too, so this shows the dates line up, not that sanitation is separated from season. The test and data source are in `ventures/changepoint-detector`.
