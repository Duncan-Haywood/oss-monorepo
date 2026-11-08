---
title: "A quality audit found our research headline metric was untested, so we fixed it"
seo_title: "Mutation testing found an untested headline metric in a chip-search study"
date: 2026-11-08
tags: [research, testing, mutation-testing, chip-design]
description: "Flipping min to max in the pick-regret function passed all 18 tests of the verified-dse programme. Now it fails three."
---

A seeded-mutation audit of [`research/verified-dse`](../../research/verified-dse/README.md) changed `pick_regret` to choose the *worst* point on the cheap rung instead of the best. All 18 tests still passed. `pick_regret` is the metric the whole programme reports.

The cause was a coincidence in the one test: its example gave the same value for the min and the max. A second mutation, flipping the tie rule in `pilot_top_inversion` from `<=` to `<`, also passed.

The fix adds three small tests: one where min and max pick different values, one for averaging over ties, and one rung tie for the inversion. Re-applying both mutations now fails the suite. No result in the study changes, since only the tests were wrong, not the code.

The same pass corrected the project page, which still said "milestones 1 to 3 done" when the log is at milestone 98. About 40 experiment directories are still guarded only by regeneration checks, which catch drift but not a wrong formula. That is the next gap. Details are in the [programme log](../../research/verified-dse/LOG.md).
