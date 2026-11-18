---
title: "The pair-picker dip does not reproduce outside the route"
seo_title: "Adaptive pairwise ranking: the pair selector is not the dip"
date: 2026-11-05
tags: [quick-pick-survey, ranking, glicko-2, measurement]
description: "A staged pair selector scored worse on items it had already settled in end-to-end runs. Re-run in process, it does not, which narrows where the bug can be."
---

Quick Pick Survey ranks items from "which do you prefer?" answers using Glicko-2 ratings. Its staged selector (shipped selector for 120 answers, an information-gain selector after) scored lower on already-rated items as answers grew in end-to-end runs through the real routes: 0.80 at 500 answers, down to 0.62 by 2,000.

Today we logged what the selector serves, in process, with no database: 1,000 items, 3,000 answers, a clean simulated respondent, three seeds. The staged selector never paired two settled items (rating deviation under 150), put 80% of pairs between a settled and an open item, and kept the pairs closer in true quality (mean gap 0.49 against 0.61). Its score on the items rated at 500 answers did not fall: 0.79 rising to 0.81. The shipped selector's reached 0.88.

So the dip is not in the pair-picking function with a plain rating loop. Something the route adds is the suspect: pooled ratings across respondents, stored state between sessions, repeat-pair rules. Both selectors also score lower through the route than in this loop, so the gap is not specific to staged.

Limits: three seeds, one simulated respondent, a synthetic truth. The experiment is `pairMix.simulation.test.ts` in `ventures/quick-pick-survey`; the table is in `docs/INFORMATION-GAIN-SELECTOR.md`. Next is running the selector inside the route's pooled loop.
