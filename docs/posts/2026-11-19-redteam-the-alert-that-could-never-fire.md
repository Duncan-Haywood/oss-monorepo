---
title: "The alert that said it would fire in six hours, and never could"
seo_title: "Burn-rate alert detection time at the threshold: a red-team find"
date: 2026-11-19
tags: [redteam, testing, sre, slo, prometheus, hvac]
description: "24 faults seeded in an SLO alert planner and an HVAC load calculation, all 8 escapes closed; one alert read both unreachable and six hours from firing."
---

This red-team run attacked two products that changed on `main` this week:
[SLO Burn-Rate Alerts](https://marisstella.app/slo-burn-rate-alerts/), which turns an SLO
into a multi-window, multi-burn-rate Prometheus alert policy, and the
[HVAC load calculation](https://marisstella.app/hvac-load-calc/), a room-by-room heating
and cooling load.

## The seeded faults

24 small faults went in, 12 per product, one at a time, with the product's own tests run
after each. 16 broke a test (SLO tool 7 of 12, HVAC 9 of 12). Each of the 8 that got
through was a real hole and is now pinned by a test:

- **SLO tool:** the 366-day period limit (367 slipped through), the per-year budget row
  (366 days slipped through), the one-letter SLO name `a` (rejected under the fault), the
  low-traffic warning firing at 0 requests/second or on an alert that can never fire, and
  the whole-percent budget fraction in each alert's description.
- **HVAC:** skylight conduction in cooling (a `*` turned into `/` changed nothing the
  tests looked at), the overhang savings figure when an interior shade is set, and which
  hour a house with no cooling load reports as its peak.

## The real bug: "detected in 6h", "UNREACHABLE"

The tool prints, for each alert, how long a total outage takes to trip it. An alert fires
only while the error ratio is *strictly greater* than its threshold, and that is the `>`
in the generated rule. The detection-time function used `<` to decide "never", so a ratio
exactly at the threshold counted as firing.

This shows up when the threshold is exactly 100%. A 90% SLO over a 50-day period gives
the 6-hour page a 10x burn rate, and 10 × 10% = 100%. Even a total outage, an error ratio
of 1, never exceeds 1. The CLI printed:

```
page      10x burn  6h/30m  error ratio > 100%  total outage detected in 6h  UNREACHABLE
```

Two columns of the same row disagreed. It now reads `detected in never`. The same happens
with an 80% SLO over 25 or 50 days, or 90% over 100 or 300.

The fix is one character (`<=`). The guard is wider than the bug. A sweep over 10 SLOs
and every period from 1 to 366 days checks that each alert shows a finite detection time
exactly when it is reachable. It fails on the old code and runs in about 50 ms.

## Numbers

| | Seeded | Caught before | Caught after |
|---|---|---|---|
| SLO burn-rate alerts (`engine.mjs`) | 12 | 7 | 12 |
| HVAC load (`load.mjs`) | 12 | 9 | 12 |
| Total | 24 | 16 (67%) | 24 (100%) |

Real defects found: 1, patched: 1.
