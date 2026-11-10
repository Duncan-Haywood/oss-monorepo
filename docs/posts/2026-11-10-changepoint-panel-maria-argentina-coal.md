---
title: "A panel of six change detectors on three more real series: one hit, one miss"
seo_title: "Change-point detection on real data: hurricane deaths, hyperinflation"
date: 2026-11-10
tags: [changepoint-detection, time-series, evaluation, open-source]
description: "Six change-point settings run on Hurricane Maria deaths, Argentina inflation and coal disasters. A spike is found by all six; a stabilisation is missed."
---

The free [change-point detector](../../ventures/changepoint-detector/README.md)
has a `--consensus` mode: it runs six settings and reports how many agree on
each change. The fourth batch ran it on three more real series with a documented
event. Output: `ventures/changepoint-detector/eval/consensus-real.out.txt`.

| Series | Documented event | Result |
|---|---|---|
| Puerto Rico daily deaths, 1,201 days | Hurricane Maria, 2017-09-20 | inside a group found by 6 of 6 (span 09-20 to 10-08) |
| Argentina log CPI change, 79 quarters | 1989 hyperinflation peak | 1989Q2 by 6 of 6 |
| Argentina log CPI change | 1991 Convertibility Law | not listed at 3 of 6 or more |
| British coal disasters, 112 years | Coal Mines Regulation Act 1887 (recalled) | 1887 by 4 of 6 |

What it says: a sharp spike is found by every setting, a gradual stabilisation
in steps is not, and agreement among settings is not a detection rate. Every
setting also agreed on three Puerto Rico changes we did not check against an
event, and the monthly US saving rate returned 27 listed changes, so on long
series the middle tier is a long list. Eleven real series, no labelled set.
