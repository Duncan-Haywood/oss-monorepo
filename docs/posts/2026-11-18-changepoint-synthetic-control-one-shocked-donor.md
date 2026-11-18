---
title: "Comparing a handful of stores? One store with its own bad month can hide a real effect"
seo_title: "Synthetic control with few donors: one shocked donor kills power"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "With 11 to 21 units, a real effect reaches rank 1 in about 57% of simulated panels. One donor with its own shock cuts that to 38%, or 9%. Leave it out first."
---

[Earlier today](2026-11-18-changepoint-synthetic-control-uncertain-lead.md) the [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control met two real panels with only 17 units: West Germany after reunification and the Basque Country under terrorism. It recovered both published gaps. But the placebo test ranked West Germany 3rd and the Basque Country 4th, behind countries and regions with big shocks of their own: Norway's oil years, Asturias's coal and steel decline.

Two panels can't tell you how often that happens. A simulation can. If you're testing a price change across a dozen stores, or a policy across fifteen regions, this is the case you're in.

## The setup

Panels from the same generator the earlier rounds used: 19 points before the date, 12 after, noise with a standard deviation of 0.5. There are 11, 16 or 21 units. The treated unit drops by 1.0 (two noise sd) at the date. In some cells one donor gets its own step at the same date, 1.0 or 2.0 in size, up or down at random. That's the store that was refitted, the region where a plant closed. Nothing to do with the treatment.

The bars were written down and committed after a small exploratory run and before the 6,000-panel confirmatory one ([pre-registration](../../ventures/changepoint-detector/eval/synth-few-power-prereg-2026-11-18.md)). All six held.

## What happened

"Rank 1" means the treated unit's after/before gap ratio beat every placebo. With 16 units that's p = 1/16, the best the test can ever say.

| units | no effect | real 2 sd step | ... one donor shocked as much | ... twice as much | ... that donor left out beforehand |
|---|---|---|---|---|---|
| 11 | 9.5% | 53.5% | 38.0% | 12.8% | 58.3% |
| 16 | 6.5% | 60.0% | 40.3% | 9.0% | 56.0% |
| 21 | 6.5% | 58.8% | 34.8% | 6.0% | 57.5% |

Three things stand out.

**The estimate survives; the test doesn't.** The average gap stayed close to the true -1 in every cell, shocked donor or not. The shocked donor seldom gets much weight in the synthetic control (0.05 to 0.11 on average), so it doesn't bend the counterfactual. What it does is win the placebo ranking. Rank 1 is a single slot, and a donor with a big after-date jump takes it. A donor whose own shock is twice the effect takes the test down to roughly the no-effect rate.

**More units don't fix it.** Going from 16 to 21 units didn't raise power with clean donors (60.0% to 58.8%). The shocked donor cost the most at 21: 24 points.

**Leaving the donor out beforehand restores it.** Refit without the shocked donor and rank 1 comes back to 56 to 58%. The price is one unit, so the smallest p rises a little. The catch is the word *beforehand*. If you know a store was refitted in March, leave it out before you run anything and say why. Dropping whichever donor outranked you after seeing the result isn't a test any more.

The tool's list of units ranked above the treated one named the shocked donor in 89% of the panels that missed rank 1. So when you do miss, that list usually points at the reason.

## What changed in the tool

When there are fewer than 19 donors, the CLI and the page already printed a FEW DONORS note explaining that p ≤ 0.05 is out of reach. The note now quotes these simulated rates at the nearest of 11, 16 and 21 units. It also tells you to leave out of `--donors`, before fitting, any unit whose own event after the date you already know of:

```
node cli.mjs stores.csv --column store_07 --known-date 2026-03 --donors store_01,store_02,store_04,...
```

Limits: one panel shape, one shocked donor, step shocks only. Two shocked donors and a real deployer's panel are next. The full table and the code are in the [README](../../ventures/changepoint-detector/README.md) under "Few donors: size and power".
