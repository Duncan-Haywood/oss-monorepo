---
title: "HDBSCAN in the browser, and the 96 labels that depend on how you sort a tie"
seo_title: "HDBSCAN online, checked against scikit-learn: tied edges move labels"
date: 2026-11-16
description: "A new free HDBSCAN tool matches scikit-learn on 5,712 labels once one sort is made stable. Without that, tie order alone moved up to 96 of 300 labels."
tags: [hdbscan-clustering, clustering, research-algorithms, verification]
---

The repository had tools that rank unusual rows ([isolation forest](../../ventures/isolation-forest/README.md))
and break a table into pattern and exceptions ([robust PCA](../../ventures/robust-pca/README.md)),
but nothing that answers the most common question asked of a table of numbers: *which groups
are in here?* [hdbscan-clustering](../../ventures/hdbscan-clustering/README.md) now does, in
the browser, from the command line and as an agent call. It implements HDBSCAN (Campello,
Moulavi & Sander 2013) with GLOSH outlier scores (Campello, Moulavi, Zimek & Sander 2015).

HDBSCAN suits people without a statistics background better than k-means does, for two
reasons. You do not choose the number of clusters, only the smallest group you would still
call one. And rows that sit in no dense region are labelled **noise** instead of being pushed
into the nearest cluster.

## What it says about penguins

The example is the Palmer penguins table (344 birds, three species, CC0). With the defaults
it finds **two** clusters, not three: all 122 Gentoo, and a second cluster of 151 Adelie and
67 Chinstrap. That is not a bug. In bill length, bill depth, flipper length and body mass,
Adelie and Chinstrap overlap enough to form one dense region, and the excess-of-mass rule
keeps the most persistent split. The page shows this directly: each cluster's row lists how
the `species` column divides across it.

Switch to leaf selection with a minimum cluster size of 15 and min samples of 5 and the three
species separate (122 Gentoo; 108 Adelie with 4 Chinstrap; 42 Chinstrap). 66 birds become
noise, and on the rest the adjusted Rand index against species is 0.966. Neither answer is
wrong. They answer "what separates most persistently?" and "where are the tightest cores?"

## Matching scikit-learn exactly, after one change

HDBSCAN has no randomness, so the check can be row for row. The reference script runs
scikit-learn 1.9.1's `HDBSCAN` on the penguins and two synthetic tables at six settings each,
18 cases and 5,712 labels. The first comparison was close but not exact: a handful of labels
differed, up to 96 of 300 in one leaf-selection case.

The cause was ties. Under mutual reachability an edge weighs `max(core(a), core(b), d(a, b))`,
so every edge leaving a row in a sparse region weighs that row's core distance. Equal weights
are common: on the blobs table, 69 of the 309 spanning-tree edges share a weight with another.
Both implementations produced identical sorted weights (maximum difference 0), but
scikit-learn sorts them with numpy's default `argsort`, which is not stable, while the engine
keeps the order in which Prim's algorithm found them. When equal-weight merges happen in a
different order, the condensed tree can differ, and so can the labels.

So the reference now runs scikit-learn twice. Once with a single function, `_process_mst`,
patched to sort with `kind="stable"`. Everything else is scikit-learn's own code: core
distances, the spanning tree, condensing, stability, selection and labelling. Against that
run, all 5,712 labels match and the membership values agree to 5e-11, which is the JSON's
rounding. GLOSH scores, which scikit-learn does not expose, agree to the same precision with
the hdbscan package's `outlier_scores` applied to the same condensed tree. The unmodified
estimator is kept as a second reference. Tie order alone moved at most 1 label in
excess-of-mass selection and up to 96 of 300 in leaf selection. The tests pin both numbers.

What this means for anyone running HDBSCAN: a row whose label changes with tie order sits on
the boundary between clusters, whatever the implementation. The default excess-of-mass rule
barely notices. Leaf selection, which works with many small clusters near the bottom of the
tree, notices a lot.

## A second thing worth knowing

A single stray point placed exactly between two well-separated blobs does not come out as
noise. The spanning tree runs through it, so it leaves one of the two clusters just below the
root split and is labelled a member, with membership 0.031 and an outlier score of 0.97.
scikit-learn gives the same answer on the same points. The page therefore tells readers to
read membership and the outlier score, not only the label.

## Next

Predicting the cluster of new rows, and the DBSCAN-style `cluster_selection_epsilon` cut
(Malzer & Baum 2020), are listed as candidate modes in `portfolio/research-tools/README.md`.
The page clusters up to 10,000 rows, about 2.5 s at that size, because it computes every
pairwise distance. A k-d tree for core distances would be the first speed-up.
