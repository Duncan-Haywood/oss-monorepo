---
title: "When every country's gap grew: a panel-relative word, offered but not the default"
seo_title: "A panel-relative shape word for synthetic control placebos"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "On West Germany 1990 the plain word called 12 of 16 placebo gaps 'grew'. Read against the panel it names 2. Why it is an opt-in, with the numbers."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) runs a synthetic control. Give it a treated series, a date and a set of donor series, and it fits a weighted mix of donors to the treated series before the date, then compares the gap afterwards with each donor's own placebo gap. When a donor ranks above the treated unit, the report names that donor and puts a word to the donor's own gap: **faded** (a pulse that wore off), **grew** (a slope from the date) or **held** (a step, or noise). The word hints at what kind of event to look for in that donor.

On long series that compound, the word stops working. In the classic West Germany 1990 panel (GDP per head, 14 years after reunification), 12 of the 16 placebo gaps were called "grew". GDP gaps spread out over time whatever happened, so the word named nearly every unit.

## The fix that missed by 0.4 points

[Earlier today](2026-11-18-changepoint-shape-word-against-panel-trend.md) a pre-registered round tested a panel-relative word. Take the median unit's growth in gap size, the panel's centre. If that median would itself be called "grew", word each unit by how far it stands from the median, at the same 6x cut. On simulated compounding panels where the rule switched on, the share of clean units that got a word anyway fell from **80% to 22%**, roughly the 20% seen on trendless panels.

One bar failed. On panels that wander, the rule switched on in 1 to 3% of cases, and there it sometimes read a donor's own slope as the panel's trend. A big slope was called "grew" 68.8% of the time, against 70.7% for the plain word. The bar allowed 1.5 points and the gap was 1.9. Because the pre-registration said a failed bar keeps the rule off the default, it stayed off.

## Offered, with its numbers

That decision still stands. The panel word is not the default, and anyone running the tool gets the same words as yesterday. But a person reading a GDP-per-head panel is badly served by a word that names everyone. So the word is now an option, `--shape-word panel` on the command line or a select on the page, and when it is on, the note quotes what it buys and what it costs:

- on compounding panels, 22% of clean listed units get a word, against 80% for the plain word;
- a pulse that wore off is still called "faded" 78% of the time (plain: 74%);
- it **cannot** tell a donor's own slope from the panel's growth. A big slope was called "grew" only 33% of the time, about the 27% of all placebos that were, so "held" does not clear a unit;
- on wandering panels it costs about two points on slopes. That cost is why it is opt-in.

On West Germany 1990 the median gap grew 21.8 times in mean square from the first third of the after-period to the last. Of the two units ranked above West Germany, the Netherlands' gap now "held" and Norway's "grew". Across all 16 placebos the counts are 4 faded, 2 grew and 10 held, against 0, 12 and 4 for the plain word. The test itself does not move: rank 3 of 17, p 0.176 under either word, because the word describes the gaps and changes no p. The Basque Country panel's centre is 2.36, below the switch, so its words read the same either way.

Every rate the note quotes is pinned by a test to its line in the [confirmatory output](../../ventures/changepoint-detector/eval/synth-shape-trend-confirm.out.txt), so the text cannot drift from the evidence. What is still open is a fresh pre-registration scored only on the panels where the rule switches on. That test would decide whether the panel word can become the default.
