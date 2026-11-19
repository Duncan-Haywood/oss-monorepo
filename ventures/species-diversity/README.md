# Species diversity: how many species are there, counting the ones you have not found yet?

**You counted individuals of each species at one or more sites. Is one site
really richer than another, or did you just sample it harder?** Paste the
counts and get Chao1 and ACE for the species still undetected, Hill numbers
(richness, Shannon and Simpson diversity as effective numbers of species),
rarefaction and extrapolation curves by sample size and by sample coverage,
how many more individuals would complete the inventory, and every site
compared at equal coverage with bootstrap intervals. In the browser, from the
command line, or from an agent.

**Live:** <https://marisstella.app/species-diversity/>

Who it is for: field ecologists and students comparing plots, transects or
traps; microbiome analysts comparing OTU or ASV richness between samples;
instructors teaching rarefaction; anyone counting items per class who needs
to know how many classes were missed. Free, MIT licensed, nothing uploaded.

## What it computes

| Piece | Source | What you get |
| --- | --- | --- |
| Hill numbers | Hill 1973 | effective number of species at q = 0 (richness), 1 (exp Shannon), 2 (inverse Simpson), observed in the sample |
| Chao1 | Chao 1984, 1987 | lower-bound richness from singletons and doubletons, its SE and log-normal interval (iNEXT's three cases for f2 = 0 and f1 = 0) |
| ACE | Chao & Lee 1992 | coverage-based richness, rare species those seen 10 times or fewer |
| Entropy and Simpson estimators | Chao, Wang & Jost 2013; Good 1953 | q = 1 and q = 2 for the whole assemblage, with bootstrap SEs |
| Rarefaction | Hurlbert 1971; Chao et al. 2014 | the expected q = 0, 1, 2 of a random subsample of m individuals, exact (hypergeometric) |
| Extrapolation | Chao et al. 2014; iNEXT 3.0.2 for q = 1 | q = 0, 1, 2 at m > n, with bootstrap intervals from an estimated assemblage that includes the undetected species |
| Sample coverage | Chao & Jost 2012 | coverage at any size, the size that reaches a coverage, more individuals needed for 95% and 99% |
| Comparison | Chao & Jost 2012; Hsieh, Ma & Chao 2016 | every site at the lowest coverage, and lowest size, any site reaches at twice its sample |

Input: long (`species,count[,site]`), raw (one row per individual) or wide
(`species,siteA,siteB,...`) CSV, or a list of counts.

## The example: ten years of desert rodents at Portal, Arizona

The Portal Project has trapped rodents monthly on 24 plots near Portal,
Arizona, since 1977 and publishes every capture under CC0 (`data/SOURCE.md`).
Since 2015 ten plots are controls, eight exclude kangaroo rats and six try to
exclude all rodents. The bundled file counts 6,094 distinct tagged rodents of
21 species first caught on each plot in 2016-2025
(`node cli.mjs data/portal-rodents.csv --group treatment --count individuals`):

- **Richness is saturated, evenness is not.** Each treatment has 20 or 21
  species at coverage above 99.9%. At the common coverage of 99.97%, Simpson
  diversity is 3.51 effective species on the controls (95% interval 3.37 to
  3.65) and 2.95 where kangaroo rats are kept out (2.75 to 3.15); there one
  pocket mouse, *Chaetodipus penicillatus*, is 1,044 of the 1,900 animals.
- **The smallest sample is not the poorest plot** (`--group plot`). Plot 10
  caught 105 animals and 9 species, the fewest of 24 plots. At the common
  coverage of 98.1% it ranks ninth, at 11.9 species (7.1 to 16.7).
- **Chao1 can swing on one doubleton.** Plot 4 has 15 species, six seen once
  and one seen twice, and Chao1 says 32.9 with a long upper tail.

These are descriptive readings pooled over plots and years, not a
re-analysis of the experiment's published results.

## Use it from code

```sh
node cli.mjs data/portal-rodents.csv --group plot --count individuals
node cli.mjs --counts 52,30,21,12,9,7,5,4,3,3,2,2,2,1,1,1,1,1
node cli.mjs counts.csv --group site --bootstrap 200 --seed 3 --json
```

Agents: `node platform/agents/tools.mjs describe species-diversity` prints the
papers; `node platform/agents/tools.mjs call species-diversity analyze --input '{"counts":[52,30,21,12,1,1]}'`
(or `{"assemblages":{"north":[...],"south":[...]}}`, `{"text":"site,species,count\n...","group":"site"}`).

## Verification

- **Independent reference** (`eval/reference.py`, Python 3.11, numpy 2.4.6,
  scipy 1.17.1, mpmath 1.4.1, scikit-bio 0.7.4; output in
  `eval/reference.json`, checked by `reference.test.mjs`). Thirteen
  assemblages: lognormal samples of 60, 250 and 1,200 individuals, a
  geometric series, Chao1's edge cases (no doubletons, no singletons, one
  singleton), many singletons, the three Portal treatments and two Portal
  plots. Rarefaction of q = 0, 1, 2 and coverage come from
  `scipy.stats.hypergeom` species by species (the engine sums log binomials
  over frequency counts) and agree to 1e-10. The entropy estimator's tail
  comes from mpmath's Lerch transcendent at 30 digits (the engine sums it
  directly, or integrates it when it converges slowly) and agrees to 1e-11,
  and the tail alone to 1e-9 for A up to 1 − 1e-9. Observed Hill numbers, the
  unbiased Simpson sum and ACE agree with scikit-bio to 1e-12; Chao1 agrees
  with scikit-bio's plain Chao1 once its (n − 1)/n factor is applied. The size
  for a target coverage agrees with `scipy.optimize.brentq` to 1e-7.
  Extrapolation agrees with the formulas written again in Python to 1e-10
  (1e-8 for q = 1, whose rate divides by a small difference).
- **Real subsamples:** for a lognormal sample and Portal plot 10, the
  rarefied expectations of S, Σp² and Shannon entropy at n/3 agree within 1%
  with the means of 20,000 subsamples drawn without replacement.
- **Coverage simulation** (`node eval/coverage.mjs 1000`, output in
  `eval/coverage-output.txt`): 1,000 samples from each of four known
  assemblages, 100 bootstrap replicates each, nominal 95%:

  | Quantity | Interval held the truth |
  | --- | --- |
  | rarefied richness at n/2 | 91.9% to 97.7% |
  | richness extrapolated to 2n | 87.4% to 98.7% |
  | Shannon diversity (q = 1) | 85.4% to 95.9% |
  | Simpson diversity (q = 2) | 89.5% to 94.1% |
  | Chao1 against true richness | 49.5% to 92.6% |

  Chao1 is the weak point and the page says so: in a 120-species lognormal
  assemblage sampled with 200 individuals it averaged 82.6, a lower bound
  rather than an estimate; and once every species has been found (40 of 40,
  n = 400) its interval sits above the species seen and holds the truth only
  54.7% of the time. The lowest q = 1 figure (85.4%) is the smallest sample of
  the most uneven assemblage. An earlier version clipped the q = 1 and q = 2
  intervals at the observed value; the simulation showed that cut q = 2
  coverage to 68.8% in one scenario, and the clip was removed.
- **Tests:** `node --test engine.test.mjs reference.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`
  (layouts, Chao1 branches, curve limits and continuity at n, coverage
  inversion, seeded reproducibility, the page's quoted numbers recomputed from
  the engine, no network calls).

Not checked against iNEXT itself: R was not available in the build session.
The formulas are the published ones and follow iNEXT's documented
conventions, but a side-by-side run is the obvious next check.

## Limits

- Abundance data only; incidence data (presence in sampling units, Chao2,
  ICE) is not offered yet.
- Orders q = 0, 1, 2 only; no diversity profile over continuous q.
- Assumes individuals are sampled at random and independently. Clumped
  species, or the same animal counted twice, break the variance and the
  extrapolation.
- No phylogenetic or functional diversity, and no beta diversity.

## Disclaimer

**No warranty.** Provided free and as-is. Not legal, tax, financial,
environmental-impact, regulatory or other professional advice. Results are
statistical estimates and are only as good as the sampling behind them.
Independent: not affiliated with the authors of the cited papers or of iNEXT,
or with the Portal Project or Weecology. Built with AI assistance.

MIT licence (`LICENSE`).
