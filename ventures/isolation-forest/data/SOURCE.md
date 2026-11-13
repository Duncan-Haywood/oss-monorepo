# Data sources

All three files come from the UCI Machine Learning Repository, each under the
Creative Commons Attribution 4.0 International licence (CC BY 4.0), as the
dataset pages state. Each was downloaded by this repository's session through
its network proxy on **2026-11-13** and is kept byte for byte as served
(the wholesale file has Windows line endings; nothing was changed).

## `wholesale-customers.csv` (the page's example)

- **Dataset:** Wholesale customers. Annual spending in monetary units on six
  product groups (Fresh, Milk, Grocery, Frozen, Detergents_Paper,
  Delicassen) by 440 clients of a wholesale distributor in Portugal, with
  two codes, Channel (1 hotel/restaurant/cafe, 2 retail) and Region (1 Lisbon,
  2 Oporto, 3 other).
- **Citation:** Cardoso, M. (2013). Wholesale customers [Dataset]. UCI
  Machine Learning Repository. https://doi.org/10.24432/C5030X
- **Downloaded from:** https://archive.ics.uci.edu/static/public/292/wholesale+customers.zip
  (file `Wholesale customers data.csv`, renamed).
- **Licence:** CC BY 4.0 (https://archive.ics.uci.edu/dataset/292/wholesale+customers).

## `ionosphere.data` (verification only)

- **Dataset:** Ionosphere. 351 radar returns, 34 continuous features, class
  `g` (good) or `b` (bad); the tests treat `b` as the anomaly label.
- **Citation:** Sigillito, V., Wing, S., Hutton, L., and Baker, K. (1989).
  Ionosphere [Dataset]. UCI Machine Learning Repository.
  https://doi.org/10.24432/C5W01B
- **Downloaded from:** https://archive.ics.uci.edu/static/public/52/ionosphere.zip
- **Licence:** CC BY 4.0 (https://archive.ics.uci.edu/dataset/52/ionosphere).

## `breast-cancer-wisconsin.data` (verification only)

- **Dataset:** Breast Cancer Wisconsin (Original). 699 cases, an ID, nine
  cytology features scored 1 to 10 (16 cells missing, marked `?`) and class 2
  (benign) or 4 (malignant); the tests drop the ID, fill `?` with the column
  median and treat 4 as the anomaly label.
- **Citation:** Wolberg, W. (1990). Breast Cancer Wisconsin (Original)
  [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5HP4Z
- **Downloaded from:** https://archive.ics.uci.edu/static/public/15/breast+cancer+wisconsin+original.zip
- **Licence:** CC BY 4.0 (https://archive.ics.uci.edu/dataset/15/breast+cancer+wisconsin+original).

The two labelled sets are used only to compare this engine with
scikit-learn (`eval/reference.py`); the tool makes no medical or radar
claim from them.
