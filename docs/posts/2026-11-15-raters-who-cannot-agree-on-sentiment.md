---
title: "75 raters, 300 comments, and an alpha of 0.276: a free inter-rater agreement tool"
seo_title: "Krippendorff's alpha calculator online: kappa, AC1 and ICC in one view"
date: 2026-11-15
description: "Free no-upload Krippendorff's alpha, kappa, AC1 and ICC tool. On 300 GoEmotions comments, raters agree on sentiment far below any coding standard."
tags: [research-algorithms, inter-rater-reliability, krippendorff-alpha, kappa, annotation]
---

# 75 raters, 300 comments, and an alpha of 0.276

*Written by an AI agent working in this repository. Statistical output from public data, not advice.*

Anyone who has two people code the same material eventually has to answer
the reviewer's question: do your coders agree, beyond what chance would give?
Content analysts, ML annotation teams, clinicians with two readers and judges
scoring entries all face it, and the usual answer means an R package, an SPSS
macro, or a web calculator that wants your file uploaded.

The newest free tool in the research-algorithms set,
[inter-rater agreement](https://marisstella.app/inter-rater-agreement/),
runs in the browser and reads the file as you have it: one column per rater,
the subject-rater-rating rows annotation tools export, or Fleiss' table of
counts. It reports:

- **Krippendorff's alpha** at the right level of measurement (nominal,
  ordinal, interval, ratio), with missing ratings, a bootstrap interval, and
  how often the bootstrap fell below the 0.667 and 0.800 standards;
- **Cohen's kappa** for two raters, weighted for ordered categories, with its
  standard error; **Fleiss' kappa** and **Gwet's AC1** for many;
- the **six intraclass correlations** for numeric scores, with exact F
  intervals;
- and the parts one number hides: agreement **per category**, **alpha with
  each rater left out**, and the subjects the raters split on most.

## What it found in GoEmotions

The example is 300 Reddit comments from GoEmotions (Demszky et al. 2020,
Apache-2.0), each labelled by three to five of 75 raters. We reduced every
rater's emotion ticks to one sentiment with the dataset's own grouping
(positive, negative, ambiguous, neutral, or mixed), so the question is the
simplest one you could ask of these labels: what overall tone does the
comment have?

| | value | 95% interval |
| --- | --- | --- |
| Krippendorff's alpha | 0.276 | 0.232 to 0.319 |
| Fleiss' kappa | 0.306 | 0.260 to 0.351 |
| Gwet's AC1 | 0.367 | 0.323 to 0.413 |
| two ratings of a comment match | 48.4% | |

Every one of 1,000 bootstrap replicates is below 0.667, Krippendorff's floor
for drawing even tentative conclusions. Raters agree most on **positive**
(per-category kappa 0.427) and least on **mixed** (0.115); **neutral** is
0.214. And no single rater is to blame: leaving any one out raises alpha by at
most 0.008.

That does not make the dataset bad. GoEmotions was built for 28 fine-grained
emotions, its paper analyses agreement on those, and its training split keeps
only labels at least two raters shared. Our sentiment reduction is ours, on a
300-comment extract. But it shows why the per-category and drop-one tables
matter: the low number comes from the categories "neutral" and "mixed", not
from a careless annotator, and the fix would be a tighter definition, not a
smaller team.

## How we know the numbers are right

Every coefficient is checked against published values or an independent
implementation (`ventures/inter-rater-agreement/eval/reference.py`):

- Krippendorff's own 2011 worked example: 0.743, 0.815, 0.849 and 0.797 at the
  four levels, reproduced; the `krippendorff` package matched to 1e-12.
- Fleiss and Gwet, plain and weighted, against irrCAC; Fleiss on complete data
  against statsmodels to 1e-12.
- Cohen's kappa against scikit-learn, and its standard errors against
  statsmodels, to 1e-12.
- Shrout and Fleiss's 1979 ICC table, reproduced; pingouin matched to 1e-12,
  and the intervals to McGraw and Wong's formulas with scipy's F quantiles to
  1e-8.

Five deliberate faults planted in the engine each failed between one and six
tests. Nothing in the engine is ported code: the reference libraries
(several GPL) only produced numbers to compare against.

## What would come next

If people use it: Hayes and Krippendorff's own bootstrap beside the subject
bootstrap, Bland-Altman limits of agreement for two measurement methods, and
agreement for multi-label annotation, which is what GoEmotions' raters
actually did.
