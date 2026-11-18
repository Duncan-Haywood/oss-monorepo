---
title: "A real break that only just clears the bar: Australian gas, 1969"
date: 2026-11-08
tags: [changepoint-detector, statistics, open-data]
description: "The slope-break test finds the 1969 takeoff of Australian gas production in annual totals: W 12.23 against a bar of 12.08, p = 0.048."
---

Our changepoint detector has a test for bends in a trend, and until now every real series with a documented bend failed it or was too short: US electricity stalled in 2007 but W was 7.5 against a bar of 9.2. This run tried Australian monthly gas production (1956 to 1995, R's `forecast::gas`). Natural gas came into wide use around 1969, and production went from tiny to steep.

On the 39 annual totals the test reports one knot, at 1969. Growth was about 1,200 a year before it and 22,900 after. W is 12.23 against a bar of 12.08, so p = 0.048. That is a pass, but by about 1%, and a different bootstrap seed could flip it. On logs the test finds nothing, since the growth is close to exponential rather than one bend.

So we have one real, documented break that clears the bar, narrowly, and we say so in the README and the test (which asserts the margin stays under 10%). What we still want is a documented break that clears by a wide margin. The cause and the date are from memory, not read from a source.

Code, data source and test: `ventures/changepoint-detector` (`au-gas.test.mjs`).
