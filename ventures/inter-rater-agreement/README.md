# Inter-rater agreement: Krippendorff's alpha, kappa and ICC from one CSV

**Do your raters agree beyond chance, by how much, and where do they not?**
Paste the ratings that two or more coders, annotators, clinicians or judges
gave the same subjects, in whichever layout you have (a column per rater; the
subject, rater, rating rows annotation tools export; or Fleiss' table of
counts per category), and the tool reports:

- **Krippendorff's alpha** at the level of measurement you choose (nominal,
  ordinal, interval, ratio), with missing ratings allowed, a seeded bootstrap
  interval over subjects, and the share of replicates below Krippendorff's
  0.667 and 0.800 standards;
- **Cohen's kappa** for two raters, with linear and quadratic weights for
  ordered categories, the Fleiss-Cohen-Everitt standard error, a z test, the
  confusion table and PABAK (plus prevalence and bias indices for two
  categories);
- **Fleiss' kappa** and **Gwet's AC1** (AC2 with quadratic weights for
  ordered categories) for many raters, in Gwet's generalised form so missing
  ratings are fine, with bootstrap intervals and a note when high raw agreement
  meets a low kappa (the kappa paradox);
- **per-category kappa** (which category is confused), **pairwise kappas**
  and Light's kappa for 3 to 15 raters, **alpha with each rater left out**
  (who disagrees), and the subjects the raters split on most;
- for numeric scores by the same raters, the six **intraclass correlations**
  of Shrout & Fleiss (1979) with McGraw & Wong's (1996) exact F intervals,
  read against Koo & Li's (2016) bands.

Live page: https://marisstella.app/inter-rater-agreement/ (runs in the
browser; nothing is uploaded).

```
node cli.mjs data/goemotions-sentiment.csv
node cli.mjs scores.csv --scale interval            # a column per rater, ICCs too
node cli.mjs codes.csv --categories none,mild,moderate,severe --bootstrap 5000
node cli.mjs codes.csv --csv > by-subject.csv       # one row per subject
```

Agents: `node platform/agents/tools.mjs describe inter-rater-agreement` prints
the papers; `call inter-rater-agreement analyze --input '{"ratings": [[1,1,2],[2,2,2],[3,2,3]]}'`
runs it (one row per subject, one entry per rater, `null` for missing), or pass
`{"csv": "..."}`, `{"long": [{"item","rater","rating"}]}` or
`{"counts": [[...]], "categories": [...]}`.

## How it works

Alpha is `1 - D_o/D_e`. Each pair of ratings of the same subject enters the
coincidence matrix with weight `1/(m_u - 1)`; the difference function sets the
level of measurement (nominal 0/1; ordinal, the count of ratings ranked
between two values; interval, squared difference; ratio, squared difference
over squared sum). Every unit's contribution is precomputed so a bootstrap
replicate is a weighted sum; ordinal alpha recomputes its differences from
each replicate's marginals.

Fleiss' kappa and Gwet's AC1/AC2 share the observed agreement
`p_a = mean over subjects with 2+ ratings of sum_k r_ik (r*_ik - 1) / (r_i (r_i - 1))`
(r* the weighted counts) and differ in chance agreement: `sum_kl w_kl pi_k pi_l`
for Fleiss, `T_w/(q(q-1)) sum_k pi_k (1 - pi_k)` for Gwet. With complete data
this is Fleiss' 1971 kappa. Cohen's kappa uses the two raters' own margins.
The ICCs come from the two-way ANOVA mean squares of the subjects every rater
rated.

The level of measurement is detected when not given: labels are nominal, up to
ten whole-number levels ordinal, other numbers interval, and a category list
(`--categories`) makes the scale ordinal in that order. Ordinal weights for
kappa use category ranks (as scikit-learn does); interval and ratio
quadratic weights use the values.

## Example: how well do GoEmotions raters agree on a comment's sentiment?

`data/goemotions-sentiment.csv` holds 1,200 rows: 75 of the GoEmotions
dataset's raters labelling 300 Reddit comments, three to five raters each
(Demszky et al. 2020, Apache-2.0). Each rater's emotion ticks are reduced to
one sentiment with the dataset's own grouping; see `data/SOURCE.md`.

| | value | 95% interval (1,000 replicates, seed 1) |
| --- | --- | --- |
| Krippendorff's alpha (nominal) | 0.276 | 0.232 to 0.319 |
| Fleiss' kappa | 0.306 | 0.260 to 0.351 |
| Gwet's AC1 | 0.367 | 0.323 to 0.413 |
| percent agreement | 48.4% | |

Every bootstrap replicate is below 0.667. By category, raters agree most on
**positive** (kappa 0.427) and least on **mixed** (0.115); neutral (0.214)
and ambiguous (0.237) are nearly as weak. No single rater explains it: the
largest rise from leaving one out is +0.008. So on this extract, a comment's
overall sentiment is not something these raters reproduce; a project
training on such labels would want either an aggregate over raters or a
tighter definition of "neutral" and "mixed". This is a reading of a 300-comment
extract with our own sentiment reduction, not of GoEmotions' 28-label
annotation, which its paper analyses separately.

## Verification

`node --test *.test.mjs` (a few seconds). `eval/reference.py` writes
`eval/reference.json` with krippendorff 0.9.0 (GPL-3.0), pingouin 0.7.0
(GPL-3.0), irrCAC 0.4.4 (MIT), scikit-learn 1.9.1, statsmodels 0.15.0, scipy
1.18.1, numpy 2.5.3 and pandas 3.0.5; they produce numbers only, and no code
from any of them is in the engine.

- **Published values.** Krippendorff's (2011) worked example (4 observers, 12
  units, missing data): 0.743, 0.815, 0.849, 0.797 for nominal, ordinal,
  interval and ratio, within 0.0005; Shrout & Fleiss's (1979) six ICCs (0.17,
  0.29, 0.71, 0.44, 0.62, 0.91) within 0.005.
- **Other implementations.** Alpha equals the krippendorff package to 1e-12 at
  all four levels on five raters x 80 subjects with 15% missing, and on the
  GoEmotions example. Fleiss and Gwet, plain and quadratic, equal irrCAC to
  its five decimals; on complete data Fleiss equals statsmodels'
  `fleiss_kappa` to 1e-12. Cohen's kappa (none, linear, quadratic) equals
  scikit-learn's `cohen_kappa_score`, and its standard errors (with and under
  the null) statsmodels' `cohens_kappa`, to 1e-12. ICC values equal pingouin's
  `intraclass_corr` to 1e-12 on the Shrout-Fleiss table and on 40 x 3 biased
  numeric ratings, F and p to 1e-9 (p to 1e-6 relative on the second, where it
  is about 1e-28); the intervals equal McGraw & Wong's
  formulas evaluated with scipy's F quantiles to 1e-8 (pingouin rounds its own
  to two decimals, which they also match).
- **Properties.** Perfect agreement gives 1 for every coefficient; 3,000
  independent random rating pairs give |alpha| and |kappa| below 0.03;
  relabelling nominal categories, reversing raters and subjects, and a linear
  change of units for interval alpha leave alpha unchanged; the same ratings
  in wide, long and counts layouts give the same alpha; a planted rater who
  disagrees is the one whose removal raises alpha to 1; a 90/5/5 table gives a
  negative kappa, PABAK 0.8 and the paradox note; the bootstrap is
  reproducible by seed.
- **Mutations.** Five hand-made faults (alpha's `n - 1`, the kappa variance
  term, Gwet's chance term, the ICC(2,1) interval, the ordinal difference)
  each fail between one and six tests.
- `page.test.mjs`: disclaimer, privacy line, labels on every input, no network
  calls in any module, JSON-LD and FAQ shown on the page, BibTeX, the example
  claims on the page recomputed from the data.

## Files

| File | What |
| --- | --- |
| `engine.mjs` | readers for the three layouts, alpha, kappa family, Cohen, ICC, F and normal distributions, report and CSV; no imports, no DOM |
| `index.html` | the page: inputs, coefficient chart and table, two-rater, category, ICC, pairwise, drop-one and contested-subject tables |
| `cli.mjs` | the command line (`--help`) |
| `example-data.mjs` | the example CSV, embedded so the static page can load it |
| `data/` | the example, the script that built it from the raw files, and `SOURCE.md` (licence, hashes, what was changed) |
| `eval/` | the reference script and its output |
| `usage.mjs` | anonymous local feature counts (off under Do Not Track, with an opt-out) |

## Limits

Agreement is not accuracy: raters can agree and all be wrong. The verbal bands
(Landis & Koch; Krippendorff's 0.667/0.800; Koo & Li) are conventions. The
bootstrap resamples subjects, not raters, and is rough below about 30
subjects. Gwet's AC1 depends on the number of categories, taken from the data
unless listed. ICCs use only subjects every rater rated. Not modelled:
Dawid-Skene rater models, multi-label or span agreement, Bland-Altman limits of
agreement, tests comparing two alphas, Hayes & Krippendorff's own bootstrap.

## Credits and licence

Implemented from the papers' mathematics (`PAPERS` in `engine.mjs`):
Krippendorff 2004 and 2011, Hayes & Krippendorff 2007, Cohen 1960 and 1968,
Fleiss, Cohen & Everitt 1969, Fleiss 1971, Gwet 2008 (and his 2014 handbook
for AC2), Shrout & Fleiss 1979, McGraw & Wong 1996, Landis & Koch 1977, Koo &
Li 2016, Byrt, Bishop & Carlin 1993, Light 1971. No third-party code was
ported; the CSV reader and distribution helpers follow this repository's
`mann-kendall-trend` engine. Example data: GoEmotions (Apache-2.0), see
`data/SOURCE.md`. Code: FSL-1.1-MIT (`LICENSE`).

**No warranty.** Statistical output from data you supply; not legal, tax,
financial, medical or professional advice. Not affiliated with the authors of
the cited papers, their institutions, the GoEmotions authors or Google, or the
krippendorff, irrCAC, statsmodels, scikit-learn and pingouin projects.
