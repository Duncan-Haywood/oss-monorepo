# Example dataset: diabetes progression (Efron et al. 2004)

`diabetes.csv` is the diabetes data used in:

> Bradley Efron, Trevor Hastie, Iain Johnstone and Robert Tibshirani (2004).
> "Least Angle Regression". *The Annals of Statistics* 32(2), 407-499.
> doi:[10.1214/009053604000000067](https://doi.org/10.1214/009053604000000067)

- **Source URL:** https://www4.stat.ncsu.edu/~boos/var.select/diabetes.tab.txt
  (the tab-delimited original data file linked from the paper's data page).
- **Retrieved:** 2026-10-20, with `curl`.
- **Changes:** tabs replaced with commas. No rows or values were changed,
  added or removed. 442 rows plus a header.
- **SHA-256 of `diabetes.csv`:** `bfbdca304c928ea932d335b1a4895777cf93416afe1f43ac4fab9c6bc97cc976`
- **Licence:** no explicit licence is attached to the file. It is distributed
  publicly by the authors for research and teaching, and the same data are
  redistributed in scikit-learn (`sklearn.datasets.load_diabetes`, raw form in
  `sklearn/datasets/data/diabetes_data_raw.csv.gz`) under the BSD-3-Clause
  licence. Cite the paper above when you use it.

## Columns

| Column | Meaning (from the paper and the source page) |
| --- | --- |
| AGE | age in years |
| SEX | sex, coded 1 or 2 |
| BMI | body mass index |
| BP | average blood pressure |
| S1-S6 | six blood serum measurements |
| Y | quantitative measure of disease progression one year after baseline |

The rows are 442 diabetes patients. The data contain no names or identifiers.

`engine.mjs` embeds the first 100 data rows as its `DEFAULTS.csv` sample, and
`example-data.mjs` embeds the whole file so the static page can load it with
no network request; a test checks both match this file byte for byte.
