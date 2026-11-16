---
title: "Testing a date you name, round five: it ships, with one honest exception"
seo_title: "Interrupted time series on sticky data: round five ships"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, interrupted-time-series]
description: "A gated worst-case bootstrap met every pre-registered bar, so --known-date ships. A check after the run found one path where its p-values can't be trusted."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can now answer a question people ask about their charts all the time: *a law, a launch or a price change happened on this date; did the level or the slope change there?* The new command is `node cli.mjs data.csv --known-date 1983-02`. It took five pre-registered rounds to get here. The last one turned up something that the bar did not catch.

## Where round four left it

The method is segmented regression: a line, plus a step and a change of slope at the date you name. The noise is sticky (AR(1)), so the p-values come from a bootstrap. The test simulates many no-change series with the same stickiness and checks how often they beat the real one. The bar, written before each run, was that at the 5% level the test flags between 2% and 8% of no-change series in every simulated setting. It also had to get four real cases right.

Short series understate their own stickiness. That made the first three rounds too eager. [Round four](/posts/2026-11-16-changepoint-known-date-round-four/) added a worst case. It ran a second bootstrap at the 90% upper bound for the stickiness and kept the larger p-value. That fixed the eager cells but went too far the other way. With 40 points and moderate stickiness, it flagged 1.8% of no-change series, and it found a real step less often than its own nominal 5%.

## Round five: use the worst case only where it's needed

The change is a gate. The test first measures how sticky the residuals are around a plain line. It runs the worst-case bootstrap only when that reading is above 0.5, and the ordinary bootstrap otherwise. I picked 0.5 on an exploratory run, scoring five candidate gates on the same 200 series per setting. Then I committed the pre-registration on its own and ran the confirmatory simulation on fresh seeds.

Every bar held, on 400 series per setting:

- **Size:** 1.0% to 5.8% in every setting. The moderate-stickiness cell that failed in round four came in at 3.3%.
- **Random walks** got past the guard and were then flagged 0.3% and 0.5% of the time.
- **Power came back.** At 40 points a step as large as the noise is found 10.4% of the time with moderate stickiness (round four: 4.8%), and 20.8% with none (15.8%). At 120 points the figure is 64%.
- **Real cases:** the 1983 UK seat-belt law cut drivers killed or seriously injured by about 21% (step -0.237 on the logs, range -0.354 to -0.119). Rear-seat passengers, whom the law did not cover, show no step (p 0.50). The Nile drops by 289 units after the 1898 Aswan dam. Three placebo dates on Nottingham temperatures give nothing.

By its own rule, it ships.

## What the bar didn't catch

One setting was reported without a bar: 60 points of near-unit-root noise (rho 0.9). There the test flagged 23.6% of the series it agreed to test. Most such series are refused, so that is only 3.3% of all of them. Still, 23.6% is far too high for a result the tool presents as a test.

So I replayed every sticky setting on the same seeds and split the tested series by how they had passed the guard. Series that pass the ordinary stickiness checks were flagged 0.7% to 4.9% of the time, fine everywhere. Then there is a second door. The guard also lets a sticky series through when a step at the date makes it much less sticky, more so than 99% of random walks. That door is meant for real, large changes. With no change at all, it let 26 series through, and **17 of the 26 were flagged**. A fake step that happens to explain the wander is exactly what the F test then finds.

I did not change the pre-registered rule after seeing this. Instead the CLI now marks those results `calibrated: false`. Its report says "NOT A CALIBRATED TEST HERE", gives the 17-of-26 figure, and asks you to read the numbers as a description, not as evidence. None of the real cases took that path. The proper fix is the next round: a bootstrap that applies the same guard to its own simulated series and computes the p-value only among those it would also let through.

## Use it

```
node cli.mjs uk-driver-deaths.csv --column deaths --known-date 1983-02 --period 12 --log
```

The label is the first row after the change. `--json` gives every field, including the 95% ranges and the `calibrated` flag. The test does not say what caused a change. The seat-belt series show why a control helps: the slope rises after 1983 in all three, covered or not, so that rise was not the law.

The tables, all five pre-registrations and the diagnosis script are in the [changepoint detector's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) under "A date you name".
