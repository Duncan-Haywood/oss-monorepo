# Multiple testing correction: Benjamini-Hochberg FDR, q-values, Holm, Bonferroni, e-BH

**You ran many tests. Which results still stand?** Paste the p-values from a
batch of tests (twenty A/B-test metrics, a gene-expression screen, every
cross-tab in a survey, a hyperparameter sweep) and get, side by side:

- **false discovery rate** control: **Benjamini-Hochberg** (1995),
  **Benjamini-Yekutieli** (2001, any dependence), the adaptive
  **two-stage Benjamini-Krieger-Yekutieli** procedure (2006) and
  **Storey's q-values** (2002, 2003) with his estimate of the share of true
  nulls, pi0;
- **family-wise error** control: **Bonferroni**, **Šidák** (1967),
  **Holm** (1979) and **Hochberg** (1988);
- each test's **adjusted p-value** under each method, how many each method
  keeps, a **p-value histogram** with the null level and a **step-up plot**
  with the BH line;
- for **e-values** (likelihood ratios, betting martingales, sequential
  tests): the **e-BH** procedure of Wang & Ramdas (2022), valid under any
  dependence.

Live page: https://marisstella.app/fdr-multiple-testing/ (runs in the
browser; nothing is uploaded).

```
node cli.mjs data/bh1995.csv                         # BH at 5%, plus every other method
node cli.mjs results.csv --column pvalue --label gene --alpha 0.1 --method storey
node cli.mjs metrics.txt --method holm --all         # a bare list of p-values, one per line
node cli.mjs data.csv --csv > adjusted.csv           # every test with every adjusted value
node cli.mjs --kind e evalues.csv --alpha 0.1        # e-BH
node ../../platform/agents/tools.mjs call fdr-multiple-testing analyze --input '{"values":[0.001,0.02,0.3]}'
```

Input is a bare list of numbers (newline, comma, semicolon or space
separated) or a CSV with a header row. The value column defaults to one named
`p`, `pvalue`, `p_value`, `p.value` and so on (`e`, `evalue` with
`--kind e`); the label column to the first text column. Rows with a missing
or non-numeric value are left out and counted, with a warning that `m` then
counts only the rows used.

## Example: the Benjamini & Hochberg (1995) p-values

The bundled example is the 15 p-values of the worked example in Benjamini &
Hochberg (1995), which Benjamini, Krieger & Yekutieli (2006) reuse
(`data/SOURCE.md`). Nine are below 0.05 before correction. At 5%:

| Method | Kept |
| --- | --- |
| Bonferroni, Šidák, Holm, Hochberg | 3 |
| Benjamini-Yekutieli | 3 |
| Benjamini-Hochberg | 4 (cut-off p = 0.0095) |
| Two-stage BKY | 8 (stage 1 keeps 4; stage-2 level 0.0649) |
| Storey q-value (pi0 = 0.533 at lambda 0.5) | 9, with a warning that pi0 from 15 tests is noisy |

The example also shows BH's cliff: the 5th to 9th p-values have BH-adjusted
values between 0.060 and 0.077, so at a 10% false discovery rate BH keeps
all 9 rather than 4.

## How the methods behave: a seeded simulation

`eval/simulate.mjs` (output in `eval/simulation.json`) draws 1,000
one-sided z-tests, a share of them with a mean shift of 2.5, and runs every
method at 0.05, 400 times per setting. Means over runs:

| Setting | Method | Actual FDR | P(any false) | Power |
| --- | --- | --- | --- | --- |
| 100 effects, independent | Holm | 0.005 | 0.048 | 0.084 |
| | Benjamini-Hochberg | 0.044 | 0.767 | 0.340 |
| | Benjamini-Yekutieli | 0.006 | 0.068 | 0.097 |
| | Two-stage BKY | 0.043 | 0.752 | 0.338 |
| | Storey q-value | 0.049 | 0.805 | 0.362 |
| 100 effects, all pairs correlated 0.5 | Benjamini-Hochberg | 0.029 | 0.228 | 0.316 |
| | Two-stage BKY | 0.031 | 0.228 | 0.316 |
| | Storey q-value | **0.109** | 0.325 | 0.376 |
| 400 effects, independent | Benjamini-Hochberg | 0.030 | 0.998 | 0.601 |
| | Two-stage BKY | 0.038 | 1.000 | 0.647 |
| | Storey q-value | 0.050 | 1.000 | 0.702 |

BH's actual FDR sits near pi0 x 0.05 (0.045 with 100 effects, 0.030 with
400), which is the slack the adaptive methods recover. Under strong
positive correlation BH stays valid, as Benjamini & Yekutieli (2001) prove,
but Storey's plug-in pi0 does not: its false discovery rate more than
doubles the target. The cause is the pi0 estimate (truth 0.9): independent,
it stayed between 0.854 and 0.942 in 90% of runs; correlated, it fell below
0.5 in 26% of runs (5th percentile 0.116), and in those runs the q-values'
false discovery proportion averaged 0.41. One correlation structure and one effect size; a
pattern to check, not a general bound.

## Verification

Run `node --test` in this directory (or
`python3 platform/ci/run_venture_tests.py fdr-multiple-testing` from the root).

- **Against statsmodels 0.15.0.** `eval/reference.py` (numpy, scipy,
  statsmodels) writes `eval/reference.json` for six lists: the example, an
  all-null and an all-significant edge case, 200 two-sided tests rounded to
  three decimals (ties), 1,000 one-sided tests, and 120 with p-values down to
  1e-14 and a block of exact 1s. `engine.test.mjs` checks every adjusted
  p-value from `multipletests` for Bonferroni, Šidák, Holm, Hochberg
  (`simes-hochberg`), BH (`fdr_bh`) and BY (`fdr_by`) to 1e-12, the
  `fdr_tsbky` rejections at levels 0.01, 0.05, 0.1 and 0.2, Storey's pi0 at
  lambda 0.2, 0.5 and 0.8 and the q-values (pi0 x statsmodels' BH values).
- **e-BH** against a direct Python implementation of the paper's definition
  (`k* = max{k : e_[k] >= m / (alpha k)}`) on 300 likelihood-ratio e-values
  at four levels (9, 12, 16 and 19 rejections).
- **Published counts.** On the example: BH 4, two-stage BKY 8 with
  second-stage level 0.0649, the numbers statsmodels' own tests pin to the
  BKY paper.
- **Hand-computed** BH, Holm, Hochberg and BY values for a four-test list;
  BH's rejection set against the step-up definition at six levels.
- **Properties:** adjusted values are monotone in p, lie in [p, 1], are
  ordered (BH <= Hochberg <= Holm <= Bonferroni, BH <= BY, Šidák <=
  Bonferroni) and do not depend on input order; Šidák keeps precision at
  p = 1e-14; 200,000 tests run in about a second.
- `page.test.mjs`: disclaimer, FAQ JSON-LD matching the page, labels on
  every control, no network calls, the example loaded verbatim, the
  citations, the usage events. `cli.test.mjs`: options, errors, stdin, a
  real child process.

The reference script was run once in this session (statsmodels 0.15.0,
numpy 2.x, Python 3.13); the papers themselves were not re-read in this
session, and the implementation follows their published definitions.

## Method and citations

Implemented from the papers' definitions; no code from the authors or from
other libraries was copied (statsmodels was used only to produce reference
numbers). The engine's `PAPERS` export lists what is implemented from each
and every deviation.

- Yoav Benjamini, Yosef Hochberg (1995). Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing. *JRSS B* 57(1), 289-300. doi:10.1111/j.2517-6161.1995.tb02031.x
- Yoav Benjamini, Daniel Yekutieli (2001). The Control of the False Discovery Rate in Multiple Testing under Dependency. *Annals of Statistics* 29(4), 1165-1188. doi:10.1214/aos/1013699998
- Yoav Benjamini, Abba M. Krieger, Daniel Yekutieli (2006). Adaptive Linear Step-up Procedures That Control the False Discovery Rate. *Biometrika* 93(3), 491-507. doi:10.1093/biomet/93.3.491
- John D. Storey (2002). A Direct Approach to False Discovery Rates. *JRSS B* 64(3), 479-498. doi:10.1111/1467-9868.00346
- John D. Storey, Robert Tibshirani (2003). Statistical Significance for Genomewide Studies. *PNAS* 100(16), 9440-9445. doi:10.1073/pnas.1530509100
- Sture Holm (1979). A Simple Sequentially Rejective Multiple Test Procedure. *Scandinavian Journal of Statistics* 6(2), 65-70.
- Yosef Hochberg (1988). A Sharper Bonferroni Procedure for Multiple Tests of Significance. *Biometrika* 75(4), 800-802. doi:10.1093/biomet/75.4.800
- Zbyněk Šidák (1967). Rectangular Confidence Regions for the Means of Multivariate Normal Distributions. *JASA* 62(318), 626-633. doi:10.1080/01621459.1967.10482935
- Ruodu Wang, Aaditya Ramdas (2022). False Discovery Rate Control with E-values. *JRSS B* 84(3), 822-852. doi:10.1111/rssb.12489
- Vladimir Vovk, Ruodu Wang (2021). E-values: Calibration, Combination and Applications. *Annals of Statistics* 49(3), 1736-1754. doi:10.1214/20-AOS2020

Deviations: Storey's pi0 uses one fixed lambda (0.5 by default) rather than
the bootstrap or spline choice, with pi0 at other lambdas reported so the
choice can be checked; two-stage BKY reports rejections only.

## Limits

- Every correction assumes valid p-values (uniform or larger under the
  null). Already adjusted, p-hacked or pre-filtered p-values give
  meaningless corrections; count every test you ran.
- BH, Hochberg, Šidák and two-stage BKY need independent or positively
  dependent tests; Bonferroni, Holm, BY and e-BH hold under any dependence.
- Storey's pi0 needs many tests (hundreds) and is unreliable under strong
  correlation (see the simulation).
- Not modelled: local FDR, weighted or hierarchical procedures, online FDR,
  Westfall-Young resampling, Hommel, closed testing and gatekeeping,
  boosted e-BH.

## No warranty

Free and as-is, without warranty of any kind. Statistical output from the
data you supply; not medical, legal, tax or financial advice, and not a
substitute for a statistician. MIT licence (`LICENSE`).
