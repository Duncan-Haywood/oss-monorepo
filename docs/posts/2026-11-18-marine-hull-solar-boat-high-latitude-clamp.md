---
title: "At high latitude the solar boat's sun correction only ties the plain climatology, and wide clamps lose"
seo_title: "Solar USV sun correction at high latitude: is a wider clamp better?"
date: 2026-11-18
tags: [research, marine-hull]
description: "At nine high-latitude points with a fixed pool, a ±2% clamp ties no correction and ±10% loses in five of six years; the old wide-clamp win came from drift sign."
---

The [marine-hull programme](../../research/marine-hull/README.md) has a solar survey boat that plans its days from a sunlight climatology. It corrects that climatology with month-by-month ratios learned from its own log, clamped to a narrow band. [The last step](2026-11-18-marine-hull-solar-boat-clamp-climatology.md) found ±2% to be the best clamp on the full set of 30 ocean points, whether the climatology was current or a decade old. One loose end remained: at the nine high-amplitude points, mostly above 50 degrees where the real seasonal error of the climatology is 4.5 to 8.5%, the widest clamp (±10%) had won by a lot in one design. Did high latitude need a wider clamp?

**Fixing the pool first.** The nine points had been picked by measuring each point's seasonal bias against the climatology in use. Under the older 2005 to 2014 climatology, that measurement picked only five points, so the earlier stale-climatology sweep could not say anything about the nine. This step froze the list at the nine points picked under the 2015 to 2024 climatology. It then rescored the same fixed widths on 2020 to 2025 under the old climatology, with the boat learning from the seasons just before each year. Each scored year now pairs with a row already run under the current climatology. The run reproduced the earlier sweep's numbers on its five-point pool exactly.

**Two readings, both refuted.** One reading said a big seasonal error needs a wide clamp. The other said the wide clamp had only won by passing through a decade-level drift between the learning years and the climatology. Here the learning years do drift, 1.5% brighter than the old climatology. So the second reading predicted a wide-clamp win again. We committed eight predictions to the script before the full run. Three held. The five about which width wins all failed.

Six-year mean with three seasons of log, out of 84 cases (four battery sizes times 21 power-demand shapes, km and dark hours summed over the nine points) where a rule must match a simple 7-day baseline on distance without more dark hours:

| clamp | none | ±1% | ±2% | ±3% | ±5% | ±7% | ±10% |
|---|---|---|---|---|---|---|---|
| six-year mean | 48.5 | 48.2 | **48.5** | 48.0 | 44.1 | 40.0 | 36.6 |
| gain over none, same years, current climatology | | +0.9 | +0.7 | +0.1 | -0.8 | -1.6 | -2.8 |

±2% is again the best width, but it only ties no correction. It is ahead in three of the six years. Every width from ±4% up falls below no correction in five of six years, by as much as 26 cases in 2022.

**What flipped.** The earlier design that favoured the wide clamp also had learning years outside the climatology, but they were darker than it. There, ±10% led no correction by 19 cases. Here the drift is the other way and ±10% trails by 12. A plausible mechanism, which we have not tested: a dark learned drift makes the boat more cautious, and at points where it is mostly parked anyway that rarely costs distance. A bright drift makes it bolder, and that spends dark hours. Either way, the earlier wide-clamp result came from which way the climatology had drifted, not from how large the high-latitude season is.

**For a designer.** One rule now covers both pools: clamp the learned month ratios to ±2%. At high latitude, expect it to match the plain climatology, not beat it. Do not widen the clamp there.

**Limits.** The nine points were chosen with the current climatology, so the pool is fixed but not neutral. Most of the eight points at 50 to 60 degrees are parked with this 50 W payload, so the pooled count leans on P-30 and the North Sea. The drift-sign reading rests on two designs. One boat, calm-water daily model, NASA POWER sunlight only.

Code and numbers: [`run_width_hi9.py`](../../research/marine-hull/experiments/run_width_hi9.py), [`results_width_hi9.txt`](../../research/marine-hull/experiments/results_width_hi9.txt), and the [research log](../../research/marine-hull/LOG.md).
