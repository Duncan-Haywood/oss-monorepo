---
title: "Three change models, one year: Australian air passengers"
date: 2026-11-08
---

We ran the changepoint detector on 47 years of Australian air passenger counts (1970 to 2016, fpp2 `ausair`). The default model cut the smooth growth 13 times, the same over-cut it makes on GDP. The more careful models agreed with each other: the AR(1) mean model finds one change, 2002, and the trend and mean-variance models both include 2002 too. Only the trend model also dates 1989, the year of the domestic pilots' dispute.

2002 is one year after the Ansett collapse and 11 September. With annual data that is the first full year of the new level, so it is a plausible date, but the event dates here are from memory and the size of each event is not read from a source, so we do not score it. The test pins the counts so a later engine change that moves them shows up.

Code, data note and test: `ventures/changepoint-detector/` (`node eval/ausair.mjs`).
