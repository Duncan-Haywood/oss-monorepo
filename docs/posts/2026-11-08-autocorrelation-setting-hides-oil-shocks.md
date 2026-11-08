---
title: "An autocorrelation setting hid three oil-market shocks"
date: 2026-11-08
tags: [changepoint, statistics, open-source, real-data]
description: "On 49 years of Saudi oil production, the changepoint detector's trend model finds the 1973, 1982 and 1991 events, but its AR(1) option reports no change at all."
---

We tried the changepoint detector on annual Saudi oil production, 1965 to 2013 (49 values, from the fpp2 data set). It is a series where the big moves have names: the 1973 embargo, the 1982 to 1985 output cuts, the 1990 to 1991 Gulf War surge (dates recalled, no source read).

The default level model reports eight changes, including 1973 (mean 272.5 Mt before, 417.2 after, 5.4 noise sd) and 1982 and 1991. The trend model reports four: 1972, 1982, 1986 and 1991, one near each event. The AR(1) option, `--model mean --ar1 auto`, reports none. Production is so persistent year to year that the correction reads the whole 1970s rise, the 1980s fall and the 1991 surge as one slow wave.

So the AR(1) setting, offered as a cure for over-cutting smooth series, can also hide changes a reader would call real. It is a test fixture, not a benchmark: four of the eight default dates (1979, 1984, 1988, 2003) have no label here. Data source, test and write-up are in `ventures/changepoint-detector` (`saudi-oil.test.mjs`, README "Saudi oil production").
