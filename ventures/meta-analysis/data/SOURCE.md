# Example data: BCG vaccine trials

`bcg-vaccine-trials.csv` holds the 13 controlled trials of the BCG vaccine against tuberculosis
analysed by Colditz et al. (1994):

> Colditz, G. A., Brewer, T. F., Berkey, C. S., Wilson, M. E., Burdick, E., Fineberg, H. V. and
> Mosteller, F. (1994). Efficacy of BCG vaccine in the prevention of tuberculosis: meta-analysis
> of the published literature. *JAMA* 271(9), 698-702. https://doi.org/10.1001/jama.1994.03510330076038

Columns: `trial` (number), `author` and `year` of the trial report, `tpos`/`tneg` (vaccinated
participants who did / did not develop tuberculosis), `cpos`/`cneg` (the same for the
unvaccinated), `ablat` (absolute latitude of the trial site, degrees) and `alloc` (how
participants were allocated: random, alternate or systematic).

- **Retrieved:** 2026-11-16, as `dat.bcg` from the `metadat` R package
  (https://github.com/wviechtb/metadat, `data/dat.bcg.rda`, SHA-256
  `8508024604252ddecbbba88a5ebbbf76ddec7d32f9e5df56521f602ce5398fdb`), read with the Python
  `rdata` package and written out as CSV unchanged. No code from `metadat` (GPL) is used; only
  these 13 rows of published trial counts, which are facts reported in the cited trials and in
  Colditz et al., are reproduced here.
- **Check:** the values reproduce the analysis of this dataset printed in metafor's README
  (https://github.com/wviechtb/metafor, retrieved 2026-11-16): Q = 152.2330 on 12 df, REML
  tau-squared 0.3132, I-squared 92.22%, pooled log risk ratio -0.7145 with Knapp-Hartung
  interval -1.1084 to -0.3206. `engine.test.mjs` asserts each of these to the printed digits.
- **Licence:** counts of trial outcomes are facts; this CSV is offered under the repository's MIT
  licence with the citation above. Cite Colditz et al. (1994) when you use it.
