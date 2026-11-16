---
title: "A lead that failed on fresh data: five bee dances and a joint changepoint fit that went quiet"
seo_title: "Testing a multivariate changepoint setting on fresh bee dance data"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, multivariate]
description: "The best joint setting on three labelled series scored worst on five fresh bee dances: why AR(1) plus a floor muted columns, and the new warning."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can fit one segmentation across several columns at once: temperature and CO2, three currencies, a machine's sensors. A joint fit like this tends to cut smooth columns into staircases, so it has options that raise each column's noise allowance. A floor sets the allowance at a multiple of the scatter about a local line. An AR(1) correction scales it up by how strongly each point follows the last.

On the three multi-column series in the Turing Change Point Dataset, one combination did best: AR(1) plus a floor of 2 on every column, mean F1 0.564. That setting wasn't the one I'd committed to in advance, though, and three series is a small panel. So I wrote it down as a lead that needed fresh data before it counted for anything.

## The fresh data

The honeybee dance set (Oh, Rehg, Balch and Dellaert, 2008) tracks a dancing bee's position and heading frame by frame. It labels each switch between the dance's left turns, right turns and waggles. There are six sequences, and TCPD already includes the sixth, so I scored only sequences 1 to 5. Those have 602 to 1124 frames and 16 to 28 labelled switches each. I used the copy in the KL-CPD repository, which is BSD-licensed.

Before scoring anything I committed [the script](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/beedance-multi.mjs) with its rule. The lead would count as confirmed only if it passed all three tests: the best mean F1 of the six joint settings, a higher F1 than the column-by-column consensus, and a win over the current default on at least four of the five dances.

## What happened

| joint fit | mean F1, dances 1-5 | changes reported |
|---|---|---|
| default (floor only the columns that over-cut) | 0.337 | 35-61 |
| AR(1) only | **0.353** | 7-91 |
| AR(1) plus floor 2 (the lead) | 0.244 | 0-25 |
| column-by-column consensus | 0.242 | 0-27 |

The lead beat the default on none of the five dances. On dance 3 it reported no change at all, where the labels mark 16. It cleared just one of the three tests, beating the consensus by 0.002.

## Why it went quiet

Both corrections raise the noise allowance, and together they compound. The floor lifts a smooth column's sd. The AR(1) correction then multiplies that by the square root of (1 + rho) / (1 - rho), which grows without limit as rho nears 1. A bee's position traces a smooth path, so rho is close to 1. A column scaled to the range 0 to 1 ended up with a noise sd between 1.07 and 1.88. No move inside the column's own range could pay the penalty, so the fit ignored that column completely.

The detector now says when this happens. If the floor or the AR(1) correction lifts a column's noise sd above three times that column's whole-series sd, the output names the column and warns that changes in it can barely register. I picked the factor of 3 after the bee run, then checked it on simulated columns. Under the default settings it fired on none of 1,800 simulated columns: white noise, autocorrelated noise, random walks and smooth sines. Under AR(1) plus floor 2 it fired on almost every autocorrelated column, which is exactly what that option does to them.

## What it doesn't say

None of the settings did well here. The best mean F1 was 0.353 against 16 to 28 labels, and I didn't rerun published methods on these dances. The heading column wraps around at the edge of its scale and I left it as distributed. Plain AR(1) came out on top, but that's a new lead, not a finding, and it needs a sixth fresh set before it means anything. The joint default stays as it was, as I'd decided in advance. The full table, the simulations and the limits are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md).
