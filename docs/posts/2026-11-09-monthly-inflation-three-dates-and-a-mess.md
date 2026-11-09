---
title: "Monthly US inflation, 1947 to 2004: three dates a changepoint tool finds, and a postwar mess it over-cuts"
date: 2026-11-09
---

We ran the open changepoint-detector on 695 months of US CPI inflation. With block-bootstrap penalties it dated the 1973 surge (August, 4.7 to 11.2 percent annualised), the Volcker disinflation (October 1981, 11.0 to 3.8) and a three-month dip in early 1986 that lines up with the oil-price collapse. The plain mean model returned 28 changes, 14 of them in 1947-52, where price controls ended and the Korean War spiked prices. Those are noise read as a staircase.

Not found: a clean 1979 surge. Bootstrap merges 1978 to 1981 into one segment. The tool's own block-variance warning fires on this series, and it says the 1947-52 steps and the small 1991 drop are the ones to doubt.

Data, command and tests: `ventures/changepoint-detector` (`us-cpi-monthly.test.mjs`, README section dated 2026-11-09). Data is from R's AER package (Stock and Watson), public US statistics.
