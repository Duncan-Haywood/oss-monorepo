# Example dataset: leukaemia remission times (Freireich et al. 1963)

`leukemia.csv` holds the remission data of:

> Emil J. Freireich and others (1963). "The Effect of 6-Mercaptopurine on the
> Duration of Steroid-Induced Remissions in Acute Leukemia: A Model for
> Evaluation of Other Potentially Useful Therapy". *Blood* 21(6), 699-716.

42 children with acute leukaemia in remission were given 6-mercaptopurine
(6-MP) or placebo; `weeks` is the time to relapse or to the end of
follow-up, and `relapsed` is 1 for a relapse and 0 for a patient still in
remission when last seen (censored). `sex` and `logWBC` (log white blood
cell count) come from the version of the data in David G. Kleinbaum and
Mitchel Klein, *Survival Analysis: A Self-Learning Text* (Springer), known
there as the "anderson" data. The file does not label the `sex` codes, so
this repository does not either.

- **Source file:** `lifelines/datasets/anderson.csv` in the lifelines Python
  package, version 0.30.3 (MIT licence), installed from PyPI. lifelines cites
  `http://web1.sph.emory.edu/dkleinb/allDatasets/surv2datasets/anderson.dat`
  as its origin; that host did not resolve from this session, so it was not
  read directly.
- **Retrieved:** 2026-11-11.
- **Cross-check:** the times and relapse flags agree, row for row by group,
  with `lifelines/datasets/gehan.dat` (Gehan 1965's tabulation of the same
  trial) in the same package.
- **Changes:** space-separated to comma-separated; columns renamed
  (`t` -> `weeks`, `status` -> `relapsed`); `Rx` recoded to
  `treatment` (0 -> `6-MP`, 1 -> `placebo`, matching the 9 and 21
  relapses reported for the two arms). Row order kept. 42 rows plus a header.
- **SHA-256 of `leukemia.csv`:** `5035084cedbd144b16c549e682a9a78ff0393d9e484fe39522b06ee6537ce053`
- **Licence:** the data are measurements published in 1963; no licence is
  attached to the file beyond the lifelines package's MIT licence, under which
  it is redistributed. Cite Freireich et al. (1963) when you use it.

The data contain no names or identifiers.
