# Data sources

## `penguins.csv` (the page's example and a verification dataset)

- **Dataset:** Palmer penguins. Bill length and depth (mm), flipper length
  (mm) and body mass (g) of 344 adult Adélie, Chinstrap and Gentoo penguins
  nesting on three islands near Palmer Station, Antarctica, 2007 to 2009,
  with species, island, sex and year. Two penguins have no measurements
  (`NA`); the tool leaves them out.
- **Collected by:** Dr Kristen Gorman with the Palmer Station Long Term
  Ecological Research (LTER) programme. Originally published in: Gorman KB,
  Williams TD, Fraser WR (2014). Ecological sexual dimorphism and
  environmental variability within a community of Antarctic penguins (genus
  *Pygoscelis*). PLoS ONE 9(3): e90081.
  https://doi.org/10.1371/journal.pone.0090081
- **Packaged by:** Horst AM, Hill AP, Gorman KB (2020). palmerpenguins:
  Palmer Archipelago (Antarctica) penguin data. R package version 0.1.0.
  https://allisonhorst.github.io/palmerpenguins/ doi:10.5281/zenodo.3960218
- **Downloaded from:**
  https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv
  on **2026-11-16** through this repository session's network proxy, kept
  byte for byte as served (SHA-256
  `f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93`).
- **Licence:** CC0 1.0 (the package's LICENSE.md and README, "Data are
  available by CC-0 license in accordance with the Palmer Station LTER Data
  Policy and the LTER Data Access Policy for Type I data").

The package asks that anyone *publishing* analyses of the data contact
Dr Gorman. This tool only uses the table as a worked example of a clustering
method and makes no ecological claim from it; the page and README cite the
original paper and the package.

## `eval/blobs.csv` and `eval/moons.csv` (verification only)

Synthetic tables written by `eval/reference.py` with fixed numpy seeds
(blobs: three Gaussian blobs of different spread plus uniform noise, seed
20261116; moons: scikit-learn's `make_moons(300, noise=0.06,
random_state=7)` plus a small third column, seed 7). They are generated
here, so no licence applies beyond this repository's FSL-1.1-MIT licence.
