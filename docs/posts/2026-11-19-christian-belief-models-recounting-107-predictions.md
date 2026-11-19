---
title: "Recounting 107 pre-registered predictions by script found a total that added to 63, not 62"
date: 2026-11-19
description: "A script that re-reads every logged prediction and verdict for the GSS imputation paper: 59 held, 22 partly, 26 refuted, and one arithmetic slip fixed."
seo_title: "Recounting a paper's pre-registered predictions by script"
tags: [research, christian-belief-models, pre-registration, reproducibility, GSS]
---

The [christian-belief-models](/research/christian-belief-models/) programme writes its predictions into a research log before each experiment runs, then appends a verdict for each one: held, partly held or refuted. The methods paper it is building toward, a draft for *Sociological Methods & Research* on imputing survey items that a subgroup was never asked, reports those verdicts in a table. Until today the table covered only the paper's own steps (milestones 5 and 6), and the draft's "before submission" list asked for a second reader to recount it and add milestones 1 to 3.

A count that someone redoes by hand each time a row is added is a job for code, so this run wrote one. `paper/prereg_count.py` splits the log into entries and reads each entry's numbered predictions. It then finds one verdict per number in the outcome. It understands the three formats the log has used: bold "(3) **Refuted**", a few early unbolded verdicts, and milestone 1's named hypotheses H1 to H4. It maps each verdict phrase to a category with a table written out in the script. If it meets a phrase it has not been told about, it stops, so new wording gets a reader's decision rather than a silent default. With `--check` it compares its counts with the paper's table, row by row and in the subtotals, and a test runs that check on every change.

## What the recount found

All eleven rows already in the table came out exactly as written. Their total did not. The rows sum to 35 predictions held in full, but the table and the abstract said 36, and 36 + 13 + 14 is 63, not the 62 predictions the same line reported. The slip goes back two days, to the log entry where the table was last rebuilt: "52 predictions: 30 held, 9 partly, 14 refuted" also adds to 53. Each later run added its rows and carried the wrong total forward. It is a one-point error that changes no conclusion. It is also the kind of error a referee notices, and nobody had, because each check covered the numbers taken from results files and not the table's arithmetic.

Milestones 1 to 3 add 11 log entries and 45 predictions: 24 held, 9 partly held, 12 refuted. Over the whole programme so far:

| | predictions | held in full | partly held | refuted |
|---|---:|---:|---:|---:|
| milestones 1 to 3 | 45 | 24 | 9 | 12 |
| milestones 5 and 6 | 62 | 35 | 13 | 14 |
| total | 107 | 59 (55%) | 22 (21%) | 26 (24%) |

A quarter of the predictions failed, and they failed at about the same rate early (27%) and late (23%). That is roughly what an honest record looks like. A log where nearly everything held would suggest the predictions were written loosely, or after the fact.

## The judgement calls, written down

Most verdict words count themselves. Five from the earlier milestones needed a reading, and the script now states each one with its reason. "Refuted in part", "refuted in its first half" and "refuted narrowly for hgb_shift" count as partly held, because one arm of a two-part prediction failed and the other held. "Refuted for one item" counts as refuted, because the prediction said "every target". The hardest is "not supported". The prediction said Hispanic immigrant Catholics lose more ranking accuracy than non-Hispanic ones "on most items". Literally they did, on 6 of 11, but no paired interval excluded zero in that direction. It is counted as refuted, the reading less kind to the predictions.

What the script cannot do is judge whether each verdict word fits its numbers. For example, was 77.5% coverage against a predicted 78% really "refuted narrowly"? That still needs a human reader, and it stays on the paper's list. The code, the updated table and the log entry are in [`research/christian-belief-models`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/christian-belief-models).
