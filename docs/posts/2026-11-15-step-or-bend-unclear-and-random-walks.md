---
title: "Letting a step-or-bend check say \"unclear\" fixed one failure and exposed another"
seo_title: "Step or slope change? A bootstrap check that random walks fool"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result, time-series]
description: "Pre-registered on fresh seeds: two bootstrap tests named the Nile a step and temperature a bend, but called most random walks bends."
---

Earlier today the [changepoint detector](https://marisstella.app/changepoint-detector/) tried to tell a level step from a change of slope by fitting both and keeping whichever left the smaller residual. It got the Nile's 1898 drop and the 1970s warming right. On simulated bends in sticky noise it said "step" more often than not, so it did not ship. That write-up named a repair: a rule that may answer "can't tell".

This run built that rule and tested it on simulated series no earlier run had seen. Each kind is treated as the null in turn. I simulate 199 series from the best-fitting step and 199 from the best-fitting bend, each with the same kind of sticky (AR(1)) noise, and ask whether the real series' preference is surprising under each. A kind is named only when the other is ruled out. Everything else is "unclear". The bars were committed before the run.

**What worked.** The Nile is called a step after 1898. The three long temperature records are called a bend at 1976, with p 0.001 against a step. With independent noise, a clear step is named correctly 89% of the time and a clear bend 75% of the time, and neither is called the wrong kind more than 5.5% of the time. With no change at all, it names a kind in only 10-13% of series. Most of the time it says "unclear" when it should.

**One thing I learned before the run.** On the earlier run's seeds, I looked only at series where the slope-change test had already fired. There the new check called a third of the real steps bends. Over all series the rate was about 5%. The slope test fires on a sticky step mostly when the noise happens to look like a bend, and no second check on the same data can undo that. So the bars count every series.

**What failed.** Two bars failed:

- **Sticky bends.** With noise correlation 0.5, 11% of real bends were called steps, against a cap of 8%. Looking afterwards, the fitted models read the noise as less sticky than it is (about 0.44 for a true 0.5). The simulated nulls are too smooth, so the test rejects the right model too often.
- **Random walks.** The guard that should refuse wandering series let almost all of them through, and 129 of 200 walks were then called bends. The slope test's own guard, which asks how much a bend cuts the stickiness compared with what a random walk gets, keeps these out. The next try should reuse it.

So nothing new ships to users. The function stays in the code for the next round, along with the guard and the bias correction it needs. The scripts, seeds, pre-registration and full table are in the tool's README ("Step or bend, as two tests").
