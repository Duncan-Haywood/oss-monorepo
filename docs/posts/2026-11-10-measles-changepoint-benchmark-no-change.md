---
title: "The measles change our detector 'missed' was never there"
seo_title: "Changepoint detection on weekly measles: the answer is no change"
date: 2026-11-10
tags: [changepoint-detector, time-series, benchmarks]
description: "Four of five TCPD annotators mark no change on weekly measles. Our consensus cut at the 1961 peak; the two fixes do not work as defaults."
---

Our changepoint-detector scored F1 0.643 on the measles series of the Turing
Change Point Dataset (TCPD), against 0.947 for the published AMOC method. That
looked like a missed change, and we wrote it down as one to explain.

It was not. The annotations say so directly: four of the five annotators marked
no change on the 991 weekly measles counts for England and Wales, 1948 to 1966,
and one marked week 141. Reporting nothing scores 0.947. AMOC and binary
segmentation score exactly that because their single cut is the last point,
which the metric drops. The detector missed nothing. It lost F1 because it kept
one cut.

**Where the cut is.** Week 693, April 1961, one week after the highest week in
the series (41,005 cases). Measles here runs on a two-year epidemic cycle, with
yearly means swinging between roughly 3,000 and 12,000 cases, and 1961 was the
largest year. All six settings in our consensus panel cut near that fall. Five
cut within a week of it. The sixth cut nine weeks later, which the default
tolerance still counts as the same change.

**What clears it.** Declaring the yearly season (`--period 52`, which anyone
with weekly data knows) or working on the log scale (`--log`) leaves no agreed
change, and the score rises to 0.947. Declaring the two-year cycle
(`--period 104`) makes it much worse, with 17 cuts and F1 0.105, because
epidemic sizes vary too much for a fixed two-year profile.

**Why neither became a default.** A single series cannot choose a default, so
we tried both on every TCPD series they apply to:

- `--log` on positive series with a wide range helped slightly on the 31 series
  the defaults were tuned on. On the 7 held-out series it did worse at every
  range threshold we tried (mean F1 0.711 fell to between 0.673 and 0.705).
- Declaring the calendar season implied by the timestamps (monthly 12, weekly
  52) on the 11 series that have one made 3 better, 3 worse and left 5 the same.
  The mean gain was +0.023, which is no evidence either way.

So the engine is unchanged, and the result is negative. The practical advice is
the one the page already gives: if you know your data's season, declare it. On
weekly epidemic counts, the agreed changes then match what most annotators saw.
The script and its full output are in the repository
(`ventures/changepoint-detector/eval/tcpd-measles.mjs` and `.out.txt`). The TCPD
data itself is fetched, not committed.

Caveats: one series prompted both fixes, and 7 held-out and 11 dated series are
small samples.
