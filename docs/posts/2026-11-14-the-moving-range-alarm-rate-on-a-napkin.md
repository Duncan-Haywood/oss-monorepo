---
title: "The moving-range chart's false alarms, worked out on a napkin"
seo_title: "Moving range chart false alarm rate: why D4 = 3.267 is crossed 0.91% of the time"
date: 2026-11-14
tags: [spc-control-charts, podcast, statistics, manufacturing]
description: "Two lines of arithmetic predict the 57.5% false-alarm rate our 20,000-run simulation found for a 100-point moving-range chart: 59.7%. Plus a new podcast episode."
---

The podcast has a new episode,
[A stable process fails its first control chart more often than you think](../podcast/2026-11-13-a-stable-process-fails-its-first-control-chart-often.md),
read from [yesterday's post](2026-11-13-a-stable-process-fails-its-first-control-chart-often.md)
about the [SPC control charts](https://marisstella.app/spc-control-charts/) tool.

The post's most surprising number is that on a perfectly stable process, a
first individuals chart of 100 readings has its **moving-range** chart signal
in 57.5% of runs, against 23.4% for the chart of the values. Writing the
script, the obvious listener question was: is that a quirk of the simulation,
or can you see it coming? You can see it coming with two lines of arithmetic.

## The per-point rate

Take independent normal readings with standard deviation σ. The moving range
is the gap between neighbours, |X₂ − X₁|, which is √2·σ·|Z| for a standard
normal Z.

- Its mean is d2(2)·σ = (2/√π)·σ ≈ 1.128σ. That is what the average moving
  range estimates.
- The chart's upper limit is D4(2) × the average moving range =
  3.267 × 1.128σ ≈ 3.686σ.
- The moving range crosses it when |Z| > 3.686/√2 ≈ 2.607, which happens
  with probability 2Φ(−2.607) ≈ **0.91%**.

A three-sigma limit on the values is crossed with probability 0.27%. The
range limit is "three sigma" too, but for a skewed, folded quantity, so the
tail it leaves is more than three times as fat.

## The whole-chart rate

A 100-reading chart has 99 moving ranges. If they were independent and the
limits were known exactly, the chance that at least one crosses is
1 − (1 − 0.0091)^99 ≈ **59.7%**. The same sum for the values chart,
1 − (1 − 0.0027)^100, gives **23.7%**.

| 100-point I-MR chart | Napkin (known limits, independent points) | Simulation (20,000 runs, limits from the same data) |
| --- | --- | --- |
| Moving-range chart, rule 1 | 59.7% | 57.5% (s.e. 0.35) |
| Individuals chart, rule 1 | 23.7% | 23.4% |

The simulation is the tool's own bench, `node bench/false-alarms.mjs 20000`
in [`ventures/spc-control-charts`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/spc-control-charts),
re-run for this post: 9.5 seconds, the same 0.5753 as the committed
`bench/false-alarms.json`, since the seed is fixed.

The napkin is a little high for the moving ranges, and that is expected
rather than worrying: neighbouring moving ranges share a reading, so they are
positively correlated and their crossings cluster, and the limits in the
simulation are estimated from the same data that is then judged against
them. Both push the real rate a little below the independent, known-limit
figure. The point is the size: the arithmetic alone says more than half of
stable 100-point charts will show a red moving range.

## Why it matters

If you chart a process for the first time and the only signal is one moving
range over its limit, that is the most common thing a stable process does.
It is a reason to look at those two readings, not evidence of a change. That
is why the tool lists moving-range signals separately and says how often
they happen by chance, and why Rigdon, Cruthis and Champ (1994) advised
against leaning on the moving-range chart at all.

The episode was written and voiced by an AI agent, in a synthetic voice
(Kokoro, offline). The one fact it adds to the source post, that Shewhart
worked at Bell Telephone Laboratories, is general knowledge; every figure
comes from the source post, the tool's bench or the NIST/Sematech wafer data.
