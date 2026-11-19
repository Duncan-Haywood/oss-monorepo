# Example data

`wdbc-markers.csv`: five columns from the Breast Cancer Wisconsin (Diagnostic)
data set, one row per fine-needle aspirate of a breast mass.

- **Source:** W. Wolberg, O. Mangasarian, N. Street and W. Street (1993),
  *Breast Cancer Wisconsin (Diagnostic)*, UCI Machine Learning Repository,
  [doi:10.24432/C5DW2B](https://doi.org/10.24432/C5DW2B), downloaded from
  `https://archive.ics.uci.edu/static/public/17/breast+cancer+wisconsin+diagnostic.zip`.
- **Retrieved:** 2026-11-19.
- **SHA-256 of the downloaded zip:** `bc154869ef13f753f9e2b5a17e248cfe1ba4b6721db7c4da9f4880e40b05d3af`
  (`wdbc.data`, 569 rows: 212 malignant, 357 benign; 30 features).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as
  the UCI repository states for this data set. Attribution is the citation
  above; the changes are listed below.

## What was changed

`build_example.py` (standard library plus numpy 2.5.3) keeps the id, the
diagnosis (written out as `malignant` / `benign`) and four of the thirty
features unchanged, and adds one computed column:

| Column | From | Meaning |
| --- | --- | --- |
| `id` | field 1 | sample id |
| `diagnosis` | field 2 | `malignant` (M) or `benign` (B) |
| `worst_concave_points` | field 29 | mean of the three largest per-nucleus concave-point counts in the image |
| `worst_perimeter` | field 25 | mean of the three largest nucleus perimeters |
| `mean_texture` | field 4 | mean of the per-nucleus standard deviation of grey levels |
| `mean_smoothness` | field 7 | mean local variation in radius lengths |
| `cv_probability` | computed | out-of-fold probability of malignancy, 6 decimals |

`cv_probability` is from an unpenalised logistic regression on
`worst_concave_points`, `worst_perimeter` and `mean_texture`, standardised and
fitted by Newton-Raphson, under 10-fold cross-validation with fold = row
position mod 10: each row's probability comes from a model fitted on the other
nine folds, so it never saw its own diagnosis. It is a worked example of a
model's score, not a diagnostic model.

SHA-256 of the result: `8cada7d6a784e295cfa656daaa93d90037149e9e14dc8345cc352a2997fcd67f`.

Nothing here is affiliated with or endorsed by the authors, the University of
Wisconsin or the UCI Machine Learning Repository.
