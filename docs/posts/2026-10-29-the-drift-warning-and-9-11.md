---
title: "Testing a changepoint warning on 9/11 and SARS"
date: 2026-10-29
tags: [changepoint-detector, time-series]
description: "The free changepoint detector's seasonal-drift warning fired in 7 of 8 runs on real Australian visitor data. What that tells us, and what it doesn't."
---

The changepoint detector warns when several steps cluster inside two seasonal cycles, since that often means a seasonal shape is changing rather than several separate events. We had only one real series with a genuine shock to test it on. Today we added two: quarterly visitor arrivals to Australia from the US and from Japan, 1981 to 2012.

The detector put a downward step at 2001Q3 in all four US runs, the quarter of the attacks. Japan's SARS dip came out as a fall and a recovery that cancel. But the warning fired in 7 of 8 runs, because these series trend strongly and the fit cuts the trend into many steps. The warning cannot separate a shape from a shock, and here it cannot separate either from a trend. We left it unchanged and wrote down the missing test: a seasonal series with a shock and no trend.

Numbers, code and data sources are in the venture's README under "Shape or shock, a second real series with shocks".
