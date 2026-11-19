# Example data

`red-wine-quality.csv`: seven columns from the red-wine half of the Wine
Quality data set, one row per wine.

- **Source:** P. Cortez, A. Cerdeira, F. Almeida, T. Matos and J. Reis (2009),
  *Wine Quality*, UCI Machine Learning Repository,
  [doi:10.24432/C56S3T](https://doi.org/10.24432/C56S3T), downloaded from
  `https://archive.ics.uci.edu/static/public/186/wine+quality.zip`. The paper:
  "Modeling wine preferences by data mining from physicochemical properties",
  *Decision Support Systems* 47(4), 547-553,
  [doi:10.1016/j.dss.2009.05.016](https://doi.org/10.1016/j.dss.2009.05.016).
- **Retrieved:** 2026-11-19.
- **SHA-256 of the downloaded zip:** `3ed56667f4b828242bd732d7d1dd7f2861e54432239d7fa63877014cbb0304d4`;
  of `winequality-red.csv` inside it: `4a402cf041b025d4566d954c3b9ba8635a3a8a01e039005d97d6a710278cf05e`
  (1,599 rows; quality 3: 10, 4: 53, 5: 681, 6: 638, 7: 199, 8: 18).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as
  the UCI repository's page for this data set states. Attribution is the
  citation above; the changes are listed below.

Each wine is a red Vinho Verde from Portugal; `quality` is the median of at
least three expert grades on a 0 to 10 scale (only 3 to 8 occur), and the
other columns are laboratory measurements: alcohol (% by volume), volatile
acidity (acetic acid, g/dm³), sulphates (potassium sulphate, g/dm³), total
sulfur dioxide (mg/dm³), chlorides (sodium chloride, g/dm³) and pH.

## What was changed

`build_example.py` (standard library only) keeps `quality` and six of the
eleven measurements, unchanged, renames them to snake_case and writes them
comma-separated instead of semicolon-separated. No row was dropped or edited.

`example-data.mjs` is a verbatim copy of the CSV as a JavaScript string, so the
page loads the example without a network request; `page.test.mjs` checks the
two are identical.

## Simulated data in eval/

`eval/survey.csv` (a five-point Likert answer, a three-level group and age;
400 rows) and `eval/nonpo.csv` (1,500 rows built so that `x1` breaks
proportional odds and `x2` does not) are simulated by `eval/reference.py`
with a fixed seed. They are test fixtures, not observations of anything.
