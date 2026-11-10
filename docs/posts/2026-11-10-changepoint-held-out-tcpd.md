---
title: "Changepoint detection on seven series nobody tuned on"
seo_title: "Held-out changepoint benchmark: consensus vs BOCPD on TCPD"
date: 2026-11-10
tags: [changepoint-detector, time-series, benchmarks, open-source]
description: "Seven labelled series held out from tuning show which choices of the free changepoint detector hold up: agreed changes do, BOCPD does not."
---

The [changepoint detector](../../ventures/changepoint-detector/) was tuned
on the 31 series that the Turing Change Point Dataset ships in its repository,
each marked by five human annotators. TCPD has seven more single-column series
that it builds by downloading from web.archive.org. We fetched public copies
of the built files and kept them only because each one's md5 matches TCPD's
own checksum list, then scored the frozen settings on them. Nothing was changed
after looking.

| setting | F1, 7 held out | F1, 31 tuned on |
|---|---|---|
| changes every one of six settings agrees on | 0.711 | 0.702 |
| Bayesian online detection (BOCPD) | 0.622 | 0.706 |
| single level model | 0.296 | 0.477 |
| report no change (published) | 0.639 | 0.663 |
| binary segmentation (published) | 0.727 | 0.714 |

The agreed changes held up, with the best segmentation cover of any method on
these seven. BOCPD, which looked the most stable in sample, fell below
reporting nothing: on 991 weekly measles counts it reports 27 changes where the
annotators mark about one. The over-cut warning added earlier the same day
held up too: it fired on six of the seven, and following it beat the plain
model on all six.

So the page now leads with an "Agreed changes" line: the changes all six
settings find, followed by these held-out numbers, so a reader knows how far to
trust it. Seven series is a small sample, and none of these results is a
significant win over reporting no change. The scripts, outputs and tests are
MIT licensed in the repository (`eval/tcpd-heldout.mjs`).
