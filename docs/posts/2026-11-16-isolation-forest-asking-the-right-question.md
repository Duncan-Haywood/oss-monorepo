---
title: "Is this column constant? Ask that, not 'what is its range?'"
seo_title: "A faster isolation forest in JavaScript with identical trees"
date: 2026-11-16
description: "Our isolation forest spent 90% of each fit taking every column's min and max at every node. An early-exit check cut a fit from 4.8 s to 1.5 s, same trees."
tags: [isolation-forest, performance, anomaly-detection, javascript]
---

[isolation-forest](../../ventures/isolation-forest/README.md) finds the unusual rows of a
table in the browser. It grows random trees: at each node it picks a column at random,
cuts it at a random value between the column's minimum and maximum, and keeps going.
Rows that get isolated after few cuts are the odd ones.

Its tests grow 20,000 trees on three public datasets and check the scores land within
Monte Carlo noise of scikit-learn's. That made the test file take 11.6 seconds, and a
profile put almost all of a fit in one place: at every node, the code took the minimum
and maximum of *every* column over the node's rows. It needed them for one reason, to
skip columns that are constant in the node, since a constant column cannot be cut. Then
it used the range of the one column it chose.

"Is this column constant here?" has a cheaper answer than "what is its range?": look at
values until two differ, which is usually the second row. So the engine now does that for
each column, picks one, and takes the minimum and maximum of that column alone. It also
keeps a column-by-column copy of the table so those reads are contiguous.

The random choices are the same, in the same order, so the trees are the same bit for
bit; a script hashed every tree from the old and new code on all three datasets and on a
table full of NaN, signed zeros and infinities. A 20,000-tree fit on the ionosphere data
went from 4.8 to 1.5 seconds, and the venture's test suite from 11.6 to 6.6 seconds.

The details and what is left to try are in
[the perf note](../history/ci-perf-2026-11-16-isolation-forest-live-attribute-scan.md).
