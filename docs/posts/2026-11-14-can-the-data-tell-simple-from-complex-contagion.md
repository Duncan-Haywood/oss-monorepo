---
title: "Can adoption data tell a simple contagion from a complex one? We simulated it on the microfinance villages"
seo_title: "Telling simple from complex contagion in adoption data"
date: 2026-11-14
tags: [research, civ-seeding, networks, complex-contagion, identification]
description: "On the 43 real village networks of the 2013 microfinance study, the estimation recovers the true contagion model 55 to 82% of the time out of sample, and the real villages fit none of the models."
---

Earlier today the `research/civ-seeding` programme found that two *complex* contagion models,
where adoption needs reinforcement from several adopting friends, fit the 43 Karnataka
microfinance villages better than the simple information model, but predicted held-out
villages worse. Before reading anything into that, we asked a plainer question: if we knew
which model made the data, would this estimation pick it?

So we made data where we do know. From each fitted model (simple information, a 60% adoption
threshold, and reinforcement) we simulated 200 synthetic versions of the study, on the real
household networks with the real leaders and household traits, then refitted all three models
to each version and recorded which one won.

**Fit within the sample picks the bigger model, whatever the truth.** With the five moments the
original paper used, villages made by the simple model were called reinforcement 85% of the
time. With eight moments it was 72%. More parameters fit noise, and in-sample fit cannot tell.

**Leaving one village out does much better, but not well.** Fit on 42 villages, score the 43rd,
repeat: the true model is recovered 58.5% of the time for the simple model, 82% for the
threshold model and 55.5% for reinforcement. When reinforcement really is at work, this test
still prefers the simple model in a third of datasets. So this morning's "complex models predict
worse" is weak evidence against them.

**One prediction failed.** We expected the hardest-to-separate pair of parameters to be
reinforcement against adopters' word of mouth, since freeing one moved the other. The local
sensitivity of the moments says otherwise: the direction the data barely see is the base
adoption rate traded against non-adopters' word of mouth and reinforcement together.

**The bigger finding was not the one we planned for.** We checked afterwards (and label it as a
post-hoc check) how the real data compare with the synthetic data. The real villages' held-out
prediction errors are two to four times larger than any of the three models produces in its own
simulated villages; at most 1.5% of any model's datasets reach the real level. Real villages
differ from each other far more than any of these models lets them, and that gap is larger than
the simple-versus-complex difference we set out to measure.

For a rollout of solar home systems, cookstoves or farm kits, that matters more than which
contagion is "right": a seeding rule tuned to one fitted model will be tuned to a village that
does not exist. The next step adds village-level differences in the base adoption rate and in
word of mouth, and checks that real data then look like the model's data, before we compare
seeding rules.

Code, data (CC0), the confusion matrices and the research log, with every hypothesis written
before its run: [`research/civ-seeding`](https://marisstella.app/research/civ-seeding/).
Written with AI assistance (Claude Code). No affiliation with the study's authors is implied,
and none of this is advice about any real village or household.
