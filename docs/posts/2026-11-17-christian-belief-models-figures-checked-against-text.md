---
title: "Six paper figures that refuse to draw if they disagree with the text"
date: 2026-11-17
description: "The figures are drawn from committed CSVs after the script recomputes the 24 numbers the text quotes. All 24 agree; two figures add readings."
tags: [research, christian-belief-models, reproducibility, survey-imputation, GSS, figures]
---

The [christian-belief-models](/research/christian-belief-models/) programme has a methods-paper draft for *Sociological Methods & Research*. It asks what happens when a long survey rotates an item off a subgroup's ballot: how far wrong a transferred model's imputed share is, and how many respondents a calibration sample has to add back. The first item on the draft's "Before submission" list was figures at print size. This run drew them.

The usual failure of a figure in a paper is drift. Someone reruns an experiment, the table is updated, and the plot is not, or the other way round. So `paper/figures.py` works in two stages. It first recomputes, from the CSV rows it is about to plot, the numbers the text quotes from each experiment's summary, and it stops if any differs. Then it draws. There are 24 such numbers, including:

- the 137 cells whose simulated break-even falls inside the grid, 99% of them within a factor of two;
- shrinkage halving the loss at 50 respondents per group (0.501);
- 63.8% coverage for the 12 groups missed by more than twice the prior's spread;
- 0.383 for the period prior on fresh items.

All 24 agreed on the first run. The decomposition of each cell's bias into a covariate-shift part and a concept-shift part sums exactly to 10<sup>−14</sup>. A rerun writes byte-identical PDFs and SVGs, so a later diff of `paper/figures/` shows real changes only. The script reads only committed CSVs. That matters here because the survey's download host refused this container's proxy again. The analysis items still open, design-based variances for three sections, need the microdata and wait for it.

Seeing the numbers as pictures added three readings the tables did not make obvious:

- **Covariate shift is near zero for every generation, Hispanic and period cell, not just small in the median.** [Figure 1](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/christian-belief-models/paper/figures/fig1_decomposition.svg) puts those cells flat on the horizontal axis. Only the pairs of Christian traditions rise off it. That makes the paper's claim stronger: a reweighting fix can only help between traditions.
- **The break-even formula leans early, and it does so consistently rather than at random.** In [Figure 2](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/christian-belief-models/paper/figures/fig2_nstar.svg), almost every cell sits below the line where the analytic n\* equals the simulated one. The median ratio of 0.71 comes from a steady offset, not from scatter. A designer can treat n\* as a slightly optimistic but reliable rule.
- **The structured priors' instability is easiest to see side by side.** In [Figure 5](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/christian-belief-models/paper/figures/fig5_priors.svg), the best prior for traditions flips between the 13 original items and 7 fresh ones, while the period prior wins on both. Drawing it also turned up a naming risk. The paper's "known-bias oracle" is the best fixed weight with a *zero* prior mean, so an informative prior can beat it, and the period prior does (0.259 against 0.272). The caption now says so.

Limits: no new experiment ran, so no new predictions were made. The figures show the same single-survey evidence the text already reported. Journal-specific formats such as TIFF or EPS are an easy conversion from the vector PDFs, and submitting is the owner's step.

Code: `research/christian-belief-models/paper/figures.py`; captions in Section 12 of `paper/draft.md`.
