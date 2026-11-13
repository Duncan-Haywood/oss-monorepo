---
title: "An isolation forest in a browser tab, and how to test a random algorithm against another"
seo_title: "Free isolation forest online: find outliers in a CSV"
date: 2026-11-13
tags: [isolation-forest, anomaly-detection, outliers, research-algorithms, browser, testing]
description: "A free isolation forest ranks CSV rows by anomaly score. Random forests never match tree for tree, so we checked 20,000-tree scores against scikit-learn."
---

"Which rows of this export look wrong?" comes up with customer lists,
expense lines, orders and sensor logs. A z-score in a spreadsheet looks at
one column at a time. An **isolation forest** looks at every numeric column
at once. It is the method of Liu, Ting & Zhou (ICDM 2008; journal version in
*ACM TKDD*, 2012), and it rests on a simple idea. Cut the data at random
(pick a column, then pick a value between its minimum and maximum) and count
how many cuts it takes to leave a row on its own. Unusual rows are isolated
in a few cuts. Ordinary rows, surrounded by similar ones, take many.

The new [isolation forest tool](../../ventures/isolation-forest/) does this in
the page. You paste a CSV and it ranks every row by the score
`2^(-E[h]/c(256))`, flags the rows above 0.5 (or a top share you choose), and
lists the columns that make each top row stand out. Nothing is uploaded. It
also runs as a zero-dependency CLI and as an agent call.

## Testing a random algorithm against another one

Earlier tools in this series were deterministic, so they could be pinned to
a reference implementation to 1e-9. This one is random. Our trees use a
seeded mulberry32 generator and scikit-learn uses NumPy's, so the same seed
grows different forests. A 100-tree comparison would only show noise.

What should agree is the **expected** score: the limit as the forest grows.
Two implementations that grow trees by the same rules converge to the same
number for every row. So `eval/reference.py` fits scikit-learn 1.9.1 with
20,000 trees on three public UCI datasets, and the test does the same with
our engine:

| Dataset | Rows × features | Max abs. difference | Mean abs. difference |
| --- | --- | ---: | ---: |
| Wholesale customers | 440 × 6 | 0.0033 | 0.0006 |
| Ionosphere (one constant column) | 351 × 34 | 0.0025 | 0.0006 |
| Breast Cancer Wisconsin (16 missing cells) | 699 × 9 | 0.0029 | 0.0005 |

Is 0.0033 small? We measured it rather than guessing. Two 20,000-tree runs
of *our own* engine with different seeds differ by 0.0029 at most on the
wholesale data. The gap to scikit-learn is the same size as our gap to
ourselves, so it is Monte Carlo noise, not a different rule. A different
rule, such as picking constant columns, getting `c(2)` wrong or splitting
outside the node's range, would move whole groups of rows systematically.
The test therefore also bounds the average *signed* difference (under
0.0006). At the default 100 trees, mean AUC over seeds matches too: 0.855
on Ionosphere and 0.985 on Breast Cancer Wisconsin, as in scikit-learn.

## What the example shows

The example is 440 clients of a Portuguese wholesale distributor and their
yearly spending on six product groups (Cardoso 2013, CC BY 4.0). With the
defaults, 33 rows score above 0.5. The top one, row 184, spent 47,943 on
delicatessen against a median of 966. All of the top ten are big spenders
in at least one group.

Take the logarithm of each amount first, and eight of the top ten become
customers who buy almost nothing in one or two groups. Row 155, for one,
spent 8 on delicatessen and 55 on milk. Neither list is wrong. On
long-tailed money columns, "unusual" depends on the scale you measure it
on. The page says so in its limits rather than picking one answer for you.

One more measured number went onto the page: with 100 trees, a row's score
moves by about 0.008 between seeds for the median row, and 0.024 for the
worst one. Rows with close scores can swap places, and the page says that
too.

## Next

The extended isolation forest (Hariri, Carrasco Kind & Brunner, *IEEE TKDE*
2021) replaces axis-parallel cuts with random hyperplanes. It catches rows
that break a diagonal relationship between two columns, which plain cuts
miss. It is now on the research-tools candidate list as a mode of this tool.

*Built with AI assistance. Statistical output, not advice: a high score
means rare in this data, not wrong.*
