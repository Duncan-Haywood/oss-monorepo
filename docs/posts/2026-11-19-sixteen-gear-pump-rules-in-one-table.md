---
title: "Sixteen ways to pick a gear pump's break-even, laid out in one table"
seo_title: "Gear pump vs load-sensing: sixteen selection rules compared"
date: 2026-11-19
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, paper-writing]
description: "Twenty experiments grew one paragraph of our excavator hydraulics paper to 91 sentences. In one table, the rules show where the remaining error comes from."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a cheap fixed gear pump on an open-centre valve beats a
load-sensing pump on fuel for a small excavator. The answer turns on one
number, the gear pump's efficiency at 150 bar. Since 16 November the
programme has run twenty registered experiments, 7a to 7t, each asking what a
builder must read off a data sheet to predict where that break-even falls.

Each experiment added a few sentences to the same paragraph of the
manuscript. By this morning that paragraph ran to 91 sentences and 21,000
characters. Every number in it was correct and checked against a results
file, but no reviewer would read it to the end.

Today's step changed no result. Section 3.5 of
[`paper/manuscript.md`](../../research/heavy-hydraulics/paper/manuscript.md)
is now six subsections, and a new table lists the rules in the order they
were tested. Each rule is scored on pump families it was not fitted on. The
table has three panels, and the panels are not comparable with each other:

| Rule | Panel | Left-out RMS |
|---|---|---|
| Efficiency alone | eight catalogue families | 0.0113 |
| Efficiency plus no-load drag | eight catalogue families | 0.0022 |
| Efficiency plus drag | same families, also spun and geared (14 readings) | 0.0084 |
| Recommended: drag plus the drive's extra drag at the picked sizes | 14 readings | 0.0056 |
| Two prices: drag against the load-sensing pump's standby power | 22 idle conditions, 308 cases | 0.0056 |
| Drag at one flow (72 L/min) | 308 cases | 0.0065 |
| Pick table, measured rows | 308 cases | 0.0075 |
| Pick table, synthetic rows, anchor read off the donors | 308 cases | 0.0050 |
| The model's own picks (a bound, not a rule) | 308 cases | 0.0042 |

The full table has sixteen rows. On the 308-case panel, every rule a builder
can apply without the fuel optimum's own choices lands between 0.0050 and
0.0075. The only rules that beat 0.0053 are built on bent idle curves that
no real pump was measured on. The bound shows the form of the rule is right.
What is missing is data: a second measured pump family whose drag rises
steeply with size, like Danfoss's. More modelling cannot stand in for that.

Every cell in the table is matched against its results file by
`paper/check_numbers.py`, which now checks 167 claims in the manuscript and
finds no number without a source. The manuscript is 9,479 words, too long
for the target journal, so cutting it to length is the next paper step.
