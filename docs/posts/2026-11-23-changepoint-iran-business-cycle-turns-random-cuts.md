---
title: "Iran's dated business cycle: our recession-hearing trend model does no better than random cuts"
seo_title: "Iran's business cycle: a trend model no better than random cuts"
date: 2026-11-23
tags: [changepoint-detection, statistics, pre-registration, business-cycles]
description: "On Iran's official business-cycle dates, a stiff-slope change detector that beat chance on US recessions found 3 of 13 turns, about what random cuts get."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md) got a result that looked
like a new feature. A trend model with a stiff slope found US recessions well beyond chance: on ten series dated by
the NBER, its cuts beat the same number of random cuts on all ten (see
[the earlier post](2026-11-23-changepoint-a-stiff-slope-hears-recessions.md)). That comparison was made after the
run, though, and every series was American. Before telling anyone "this finds turning points", it needed a test
written down in advance, on a business cycle nobody here had looked at, with the random-cut baseline as a pass mark.

## The test

The fresh set is Iran's non-oil GDP, 108 quarters from about 1988 to 2015, with the official business-cycle dating
of the Monetary and Banking Research Institute: 6 peaks and 7 troughs. Both ship in the R package BCDating. We
rebuilt the level from the published growth rates and checked the alignment against the package's own cycle column
(correlation 0.89 at lag 0, lower at either side). Then we wrote two pass marks into the header of
`eval/turns-iran.mjs` and committed it before the first run:

- **Beyond chance.** The stiff model's F1 must beat random cuts at its own count by at least 0.10, with p at most
  0.05.
- **Better than what ships.** It must beat the shipped drift model's F1 by at least 0.03.

A cut counted if it fell within 2 quarters of a turn. The earlier rounds allowed 5, but these turns are a median 8
quarters apart, so with a margin of 5 almost any cut lands near one.

## The result

Both marks failed. The stiff model made 5 cuts and 3 of them landed near a turn. Five random cuts score about the
same: F1 0.400 against 0.356, p 0.53. The shipped model did no better against its own baseline (p 0.75), and on F1
it was slightly ahead of the stiff one, 0.417 to 0.400. Taking logs or widening the margin did not change the
picture.

## Why it did not travel

The reason is in the labels, and we only looked after the run. Iran's dating marks growth-cycle turns, read off a
smoothed cycle. In the dated contractions Iran's non-oil output still grew on average, 0.47% a quarter against
1.70% in expansions. The US recessions were falls in level, and a stiff slope cannot bend round a fall, so it has to
cut. A slowdown is a different thing: it is a change of slope, and a stiff slope is built not to cut for that. In
simulation it caught a clean slope kink 5% of the time.

So the stiff model hears recessions, not turning points. We dropped the turning-point option from the product's
open items. For dated turns in a smooth aggregate, a dating rule built for the job does better: Bry-Boschan, or the
quarterly version (BBQ) that BCDating implements. A changepoint model is the wrong tool.

## What we kept

The data, the pre-registered script and its output are in the repository. A test re-runs the script and checks the
output still matches, so anyone can check the numbers. Nothing changed in the tool people use. A test that fails the
way this one did is still worth publishing. It is also why we register our marks before the run and not after.
