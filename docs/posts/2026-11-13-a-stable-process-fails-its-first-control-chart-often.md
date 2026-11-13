---
title: "A stable process fails its first control chart more often than you think"
seo_title: "Control chart false alarms, Nelson rules and rational subgroups"
date: 2026-11-13
tags: [spc-control-charts, ventures, research-tools, manufacturing, statistics]
description: "In simulation, 15-29% of stable 25-subgroup control charts raise an alarm. On NIST wafer data, the choice of subgroup flips the answer."
---

A control chart answers one question for a machine shop, a lab or a packing line: has the process changed, or is this ordinary noise? Walter Shewhart's answer from the 1920s still runs most of manufacturing. Estimate the short-term spread from inside small subgroups, draw limits three of those standard deviations either side of the centre, and look for points outside them. In 1984 Lloyd Nelson added seven run rules that catch smaller shifts: nine in a row on one side, six trending, two of three beyond two sigma, and so on.

The new [SPC control charts](https://marisstella.app/spc-control-charts/) tool draws all the common charts: individuals, X-bar with R or S, p, np, c and u. It applies all eight rules, each of which can be switched off, and computes Cp, Cpk, Pp and Ppk. It runs in the browser and is MIT licensed. Building it turned up two things worth knowing before you trust a first chart.

## The constants, computed instead of copied

Every chart factor (A2, D3, D4, B3, B4) comes from three numbers per subgroup size:

- d2, the expected range of n standard normal values;
- d3, the standard deviation of that range;
- c4, the expected sample standard deviation.

Textbooks print them in a table. The tool computes them. c4 has a closed form in gamma functions. d2 and d3 come from integrating the distribution of the range numerically, which goes back to Tippett in 1925. The tests check every value against the published table for subgroups of 2 to 25, and against a simulation of 200,000 subgroups. The first attempt at d3 came out near 15 instead of 0.86, because the integration grid cut off the upper tail. The table check caught it straight away.

The run rules got the same treatment: a second, deliberately plain implementation compared with the real one on 2,000 random series. That found an off-by-one before the first commit. Rule 4 (fourteen points alternating up and down) was asking for fifteen.

## How often a stable process raises an alarm

The tool's bench simulates 20,000 processes with no change at all. Each one gets a first (Phase I) chart, with limits computed from the same data. Then it counts how many charts show at least one signal:

| Chart | Rule 1 only | All eight rules |
| --- | --- | --- |
| X-bar and R, 25 subgroups of 5 | 15% | 29% |
| Individuals and moving range, 25 points | 18% | 29% |
| Individuals and moving range, 100 points | 63% | 84% |

So on a perfectly stable process, a first chart of 100 individual readings shows a signal more often than not. Most of the rule-1 alarms come from the dispersion chart, not the chart of the values. On the 100-point individuals chart, the moving-range chart alone signals in 57.5% of runs and the individuals chart in 23.4%. The reason is simple. The range of two normal values is skewed, so its upper limit (3.267 times the average moving range) is passed by 0.92% of in-control points, against 0.27% for a three-sigma limit on the values. Rigdon, Cruthis and Champ made the practical point in 1994: the moving-range chart adds little detection power. The page lists its signals separately and says how often they happen by chance.

None of this says the rules are wrong. A signal is a reason to go and look, and the false-alarm rate is the cost of looking. It does mean one red point on a first chart is not proof of anything.

## Real wafers, two answers

The page's example is real data: NIST and Sematech's lithography case study, 450 line-width measurements from five sites on three wafers from each of thirty cassettes. Charted the textbook way, with each wafer as a subgroup of five sites, the X-bar and R chart puts 25 of the 90 wafers outside the limits. It looks like a process out of control.

But each wafer's range measures site-to-site variation: the top site averages 3.05 µm and the centre 2.03 µm. That says nothing about how much wafers differ from each other. The tool now checks this on every X-bar chart. It compares how much the averages move from one subgroup to the next with what the within-subgroup spread predicts. On these wafers the averages move 1.9 times as much, so the summary says the X-bar limits are too tight for the between-wafer variation. It suggests charting the averages as individuals, and done that way only the three wafers of cassette 27 fall outside. NIST's case study makes the same point about batch processes. The tool's job is to raise the question on your own data, not just on a textbook example.

Which chart is right depends on whether wafer-to-wafer variation is part of normal running. That is an engineering judgement, and the page leaves it to you.

## What is next

If people use it, the next steps are:

- Phase II: carry fixed limits forward from a stable period and chart new data against them.
- EWMA and CUSUM charts, for small shifts that matter.
- A proper three-way chart for batch data.

The code, the tests and the bench are in [`ventures/spc-control-charts`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/spc-control-charts).
