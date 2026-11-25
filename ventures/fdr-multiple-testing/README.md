# Multiple testing correction: Benjamini-Hochberg FDR, q-values, Holm, Bonferroni, e-BH, online FDR

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
  dependence;
- for tests that **arrive one at a time** and need a decision before the
  next (a stream of A/B tests, a monitoring job, assays run over months):
  **online FDR** with **LORD++** (Ramdas, Yang, Wainwright & Jordan 2017),
  **SAFFRON** (Ramdas, Zrnic, Wainwright & Jordan 2018), **LOND**
  (Javanmard & Montanari 2018) and **alpha-spending** (online Bonferroni),
  each test's level, the wealth left, and what batch BH would have kept in
  hindsight.

Live page: https://marisstella.app/fdr-multiple-testing/ (runs in the
browser; nothing is uploaded).

```
node cli.mjs data/bh1995.csv                         # BH at 5%, plus every other method
node cli.mjs results.csv --column pvalue --label gene --alpha 0.1 --method storey
node cli.mjs metrics.txt --method holm --all         # a bare list of p-values, one per line
node cli.mjs data.csv --csv > adjusted.csv           # every test with every adjusted value
node cli.mjs --kind e evalues.csv --alpha 0.1        # e-BH
node cli.mjs data/online-stream.csv --online         # online FDR, rows in arrival order
node cli.mjs stream.csv --online --method saffron --lambda 0.5 --w0 0.5 --csv
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

## Online FDR: tests that arrive over time

Batch procedures need every p-value before deciding anything, and adding a
test can flip an earlier decision. Online rules give test *t* a level
alpha_t computed only from tests 1..t-1, so a decision is final when made
(`online.test.mjs` checks that truncating a stream never changes the
decisions before the cut). Each spends an error budget ("alpha-wealth")
along a sequence gamma with sum at most 1 and earns some back with each
discovery:

- **LOND**: alpha_t = alpha gamma_t (D + 1), D the discoveries so far.
- **LORD++**: alpha_t = W0 gamma_t + (alpha - W0) gamma_(t - tau_1) +
  alpha sum_(j>=2) gamma_(t - tau_j), tau_j the time of the j-th discovery,
  W0 = `--w0` x alpha (default half).
- **SAFFRON**: Storey-style adaptivity online. p-values at or below lambda
  are candidates, the clock in each gamma advances only on non-candidates,
  W0 = `--w0` x (1 - lambda) alpha, and levels are capped at lambda.
- **Alpha-spending**: alpha_t = alpha gamma_t; family-wise error under any
  dependence.

gamma for LOND, LORD++ and spending is c log(max(j,2)) / (j e^sqrt(log j))
(the sequence Javanmard & Montanari propose), with c = 0.07720838, the
default of the online-fdr Python package. **Side finding:** that series
converges very slowly (the partial sum to 10^6 is only 0.52), and summed to
infinity (partial sum to 10^7 plus the closed-form tail
2e^-a(a^3 + 3a^2 + 6a + 6), a = sqrt(log N)) this c gives 0.9763, not 1.
The rules therefore spend about 97.6% of the budget: valid (the proofs need
sum <= 1), slightly conservative. The constant that sums to exactly 1 is
0.0790819667; c is kept at the usual value so results match other tools'
defaults. SAFFRON uses gamma_j = j^-1.6 / zeta(1.6).

**The online example** (`data/online-stream.csv`, "Load online example" on
the page) is **simulated**, not real data: 400 one-sided z-tests in arrival
order, each a true effect (mean shift 3) with probability 0.15
(`eval/make_online_example.mjs`, seed 20261116; 51 effects drawn). At 5%:

| Rule | Kept | False among kept |
| --- | --- | --- |
| Alpha-spending | 7 | 0 |
| LOND | 11 | 0 |
| LORD++ | 17 | 0 |
| SAFFRON | 27 | 0 |
| Batch BH (whole list, hindsight) | 38 | 0 |

**Seeded simulation** (`eval/simulate_online.mjs`, output in
`eval/simulation_online.json`): 1,000 independent one-sided z-tests, a
share pi1 with mean shift 3, 400 runs per setting, alpha 0.05. Mean false
discovery proportion / power:

| Setting | LORD++ | SAFFRON | LOND | Spending | Batch BH |
| --- | --- | --- | --- | --- | --- |
| pi1 0.02, random order | 0.007 / 0.107 | 0.032 / 0.106 | 0.010 / 0.110 | 0.010 / 0.086 | 0.052 / 0.367 |
| pi1 0.1, random order | 0.011 / 0.319 | 0.048 / 0.448 | 0.003 / 0.183 | 0.002 / 0.088 | 0.045 / 0.604 |
| pi1 0.3, random order | 0.009 / 0.530 | 0.047 / 0.758 | 0.002 / 0.286 | 0.000 / 0.087 | 0.035 / 0.770 |
| pi1 0.5, random order | 0.007 / 0.625 | 0.047 / **0.875** | 0.001 / 0.352 | 0.000 / 0.087 | 0.025 / 0.835 |
| pi1 0.1, effects first | 0.007 / 0.649 | 0.038 / 0.979 | 0.005 / 0.458 | 0.000 / 0.198 | 0.044 / 0.599 |
| pi1 0.1, effects last | 0.000 / 0.495 | 0.006 / 0.594 | 0.001 / 0.093 | 0.002 / 0.052 | 0.045 / 0.608 |

What it shows: every online rule held its false discovery rate under 5%
(batch BH's 0.052 at pi1 0.02 is Monte Carlo noise around its theoretical
pi0 x alpha = 0.049; 400 runs with about 8 discoveries each). LORD++ runs
at a fifth of its budget, which is where its power goes; SAFFRON, which
adapts to the share of nulls as Storey's procedure does offline, uses
nearly all of it and with half the stream real effects finds more than
batch BH, whose rate sits at pi0 x alpha. Order matters a great deal: the
same tests with the effects first let SAFFRON find 98% of them, more than
batch BH; sparse streams (2% effects) are where waiting for the whole list
pays most (0.37 against about 0.11). One effect size and independent tests
only; a pattern to check, not a general bound.

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
- **Online rules against a second implementation.** `eval/online_reference.py`
  re-implements LOND, LORD++, SAFFRON and alpha-spending in Python straight
  from the papers' formulas, recomputing every sum over past discoveries
  and candidates from scratch at each step (no shared code or structure with
  `online.mjs`). `online.test.mjs` checks every level to 1e-12 and every
  decision on six streams (mostly null, half signal, weak signal, an early
  burst, all null, ties with exact 0s and 1s) at two settings (alpha 0.05,
  W0 share 0.5, lambda 0.5; alpha 0.1, W0 share 0.9, lambda 0.25): 13,680
  levels. Also hand-computed first levels, LORD++ wealth never negative,
  SAFFRON levels capped at lambda, alpha-spending levels summing below
  alpha, and decisions unchanged by later arrivals. The online-fdr Python
  package (BSD-3, 1.0.0) was read for its parameter conventions but not run
  in this session; no code from it was copied.
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
- Adel Javanmard, Andrea Montanari (2018). Online Rules for Control of False Discovery Rate and False Discovery Exceedance. *Annals of Statistics* 46(2), 526-554. doi:10.1214/17-AOS1559
- Aaditya Ramdas, Fanny Yang, Martin J. Wainwright, Michael I. Jordan (2017). Online Control of the False Discovery Rate with Decaying Memory. *Advances in Neural Information Processing Systems 30*, 5650-5659. arXiv:1710.00499
- Aaditya Ramdas, Tijana Zrnic, Martin J. Wainwright, Michael I. Jordan (2018). SAFFRON: An Adaptive Algorithm for Online Control of the False Discovery Rate. *Proceedings of the 35th ICML*, PMLR 80, 4286-4294. https://proceedings.mlr.press/v80/ramdas18a.html

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
- Online: the row order is taken as the arrival order and must be fixed
  before the results are seen. LOND, LORD++ and SAFFRON are proved for
  independent p-values; only alpha-spending holds under any dependence.
  Under conservative nulls (p-values piling up near 1) SAFFRON loses power;
  ADDIS (Tian & Ramdas 2019, NeurIPS) addresses that and is not offered.
- Not modelled: local FDR, weighted or hierarchical procedures, online FDR
  under dependence, ADDIS, decaying-memory and FDX rules,
  Westfall-Young resampling, Hommel, closed testing and gatekeeping,
  boosted e-BH.

## No warranty

Free and as-is, without warranty of any kind. Statistical output from the
data you supply; not medical, legal, tax or financial advice, and not a
substitute for a statistician. FSL-1.1-MIT licence (`LICENSE`).
