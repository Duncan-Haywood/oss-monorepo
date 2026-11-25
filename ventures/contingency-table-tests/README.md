# Contingency table tests: Fisher, Barnard, Boschloo, CMH, McNemar

**Do these two groups differ, or is it chance?** Type four counts or paste a
table and get Fisher's exact test beside the exact tests that lose less power
(Boschloo's and Barnard's unconditional tests, the mid-p), the chi-square
family, and the odds ratio, risk ratio and risk difference with confidence
intervals. Larger tables get the exact Fisher-Freeman-Halton test; tables split
by site or department get Cochran-Mantel-Haenszel with a Simpson's-paradox
check; paired before-and-after data get McNemar. In the browser, from the
command line, or from an agent.

**Live:** <https://marisstella.app/contingency-table-tests/>

Who it is for: clinicians and trial statisticians with small arms, lab and
field scientists comparing proportions, epidemiologists with stratified
case-control tables, quality engineers comparing defect rates, analysts with an
A/B test too small for a z-test, and students who were told "use Fisher's exact
test when counts are small" and want to know what that costs. Free, FSL-1.1-MIT
licensed, nothing uploaded.

## What it computes

| Piece | Paper | What you get |
| --- | --- | --- |
| Fisher's exact test | Fisher 1935 | two-sided (minimum likelihood) and one-sided p-values; conditional MLE odds ratio with its exact interval |
| mid-p | Lancaster 1961 | Fisher's p-value with half the observed table's probability |
| Unconditional exact tests | Barnard 1945; Boschloo 1970 | p-values maximised over the unknown common risk, pooled or unpooled Wald ordering for Barnard |
| Chi-square family | Pearson 1900; Yates 1934 | Pearson, Yates-corrected and likelihood-ratio G, expected counts, a small-count warning |
| Effect sizes | Newcombe 1998; Katz et al. 1978; Woolf 1955 | risk difference (Newcombe hybrid score and Wald), risk ratio, sample odds ratio, phi, number needed to treat |
| r x c exact | Freeman & Halton 1951; Mehta & Patel 1983 | Fisher-Freeman-Halton by a network algorithm, Monte Carlo past a work limit (random tables with fixed margins, one hypergeometric draw per cell, so the cost grows with the square root of n), Cramér's V, adjusted residuals (Haberman 1973) |
| Strata | Mantel & Haenszel 1959; Robins, Breslow & Greenland 1986; Tarone 1985 | CMH test, common odds ratio with the RGB interval, Breslow-Day-Tarone homogeneity, exact stratified test and conditional MLE |
| Paired | McNemar 1947 | chi-square with and without correction, exact binomial and mid-p, paired odds ratio with an exact interval |

Every method's full citation, what was implemented and how it departs from the
paper are in `PAPERS` in [`engine.mjs`](engine.mjs) (and `node
platform/agents/tools.mjs describe contingency-table-tests`).

## The finding: how cautious is Fisher's exact test?

[`eval/size.mjs`](eval/size.mjs) computes, for two equal groups, each test's
exact probability of calling a difference significant at the 5% level when
there is none, for every value of the common risk from 0.001 to 0.999. No
simulation: every possible outcome is tested and its probability summed
([`eval/size.json`](eval/size.json)). Averaged over the common risk, with the
worst case in brackets:

| Test | 10 per group | 15 | 20 | 25 | 30 | 40 | 50 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pearson chi-square | 2.7% (4.2%) | 4.0% (5.5%) | 4.2% (5.3%) | 5.0% (6.5%) | 4.6% (5.5%) | 4.9% (5.9%) | 4.9% (5.7%) |
| Yates chi-square | 0.8% (1.3%) | 1.0% (1.7%) | 1.4% (2.1%) | 1.8% (3.3%) | 1.9% (2.7%) | 2.2% (3.3%) | 2.5% (3.5%) |
| Fisher exact | 0.8% (1.3%) | 1.3% (1.8%) | 1.9% (2.5%) | 2.0% (3.3%) | 1.9% (2.7%) | 2.4% (3.3%) | 2.5% (3.5%) |
| Fisher mid-p | 1.3% (2.3%) | 1.9% (3.0%) | 2.3% (3.8%) | 2.6% (3.3%) | 2.7% (3.5%) | 2.9% (3.6%) | 3.1% (3.7%) |
| Boschloo | 2.7% (4.2%) | 3.4% (4.3%) | 3.3% (4.6%) | 3.3% (4.6%) | 3.2% (4.7%) | 3.7% (4.8%) | 3.7% (4.9%) |
| Barnard (pooled Wald) | 2.7% (4.2%) | 3.4% (4.3%) | 3.8% (5.0%) | 3.7% (4.6%) | 4.0% (4.7%) | 4.1% (4.8%) | 4.2% (4.9%) |

Power to detect 20% against 50%:

| Test | 10 | 15 | 20 | 25 | 30 | 40 | 50 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pearson chi-square | 25% | 42% | 53% | 64% | 69% | 82% | 89% |
| Fisher exact | 13% | 25% | 41% | 51% | 60% | 75% | 85% |
| Fisher mid-p | 19% | 33% | 44% | 55% | 65% | 78% | 87% |
| Boschloo | 25% | 37% | 49% | 61% | 67% | 81% | 89% |
| Barnard (pooled Wald) | 25% | 37% | 49% | 61% | 68% | 81% | 89% |

So at 20 per group Fisher's test uses well under half of its 5% allowance
(1.9% on average, 2.5% at worst) and detects a 20% vs 50% difference 41% of the
time where Boschloo's equally exact test does 49%. Pearson's chi-square is more
powerful still but goes over its level (6.5% at 25 per group), so its p-values
cannot be taken at face value in small samples. The mid-p stayed under 5% at
every size here, though nothing guarantees that in general. This matches the
recommendation of Lydersen, Fagerland & Laake (2009) to prefer unconditional or
mid-p tests to Fisher's; the numbers above are our own computation, not copied
from their tables. The page defaults its headline to Boschloo for that reason.

## Examples

- **Berkeley admissions, 1973** ([`data/`](data/SOURCE.md); Bickel, Hammel &
  O'Connell 1975): pooled, 44.5% of men and 30.4% of women were admitted
  (odds ratio 1.84, p < 0.0001). By department, the Mantel-Haenszel common
  odds ratio is 0.905 (95% CI 0.772 to 1.060), CMH p = 0.232, exact stratified
  p = 0.228: no evidence of a difference once department is accounted for, and
  Breslow-Day-Tarone p = 0.0021 says the departments differ (department A's
  odds ratio is 0.35). The tool flags this as Simpson's paradox.
- **Twin convictions** (R's `fisher.test` example): 2 of 17 vs 10 of 13,
  Fisher p = 0.0005, Boschloo p = 0.0004, conditional odds ratio 0.047 (exact
  CI 0.0033 to 0.36).
- **Job satisfaction by income, 4x4** (Agresti 2002): chi-square p = 0.743
  with 8 of 16 expected counts below 5; exact p = 0.7827 in about 2 seconds.

## Use it from code

```sh
node cli.mjs --table "9,3;4,9"                                  # a 2x2, rows are groups
node cli.mjs --table "59,6;16,80" --paired                      # McNemar
node cli.mjs data/berkeley-admissions-1973.csv                  # stratified, columns picked automatically
node cli.mjs data/berkeley-admissions-1973.csv --row gender --col decision --stratum department --json
node cli.mjs counts.csv --alternative greater --unpooled
```

Agents: `node platform/agents/tools.mjs describe contingency-table-tests`;
`node platform/agents/tools.mjs call contingency-table-tests analyze --input
'{"table":[[9,3],[4,9]]}'` (or `{"csv":"..."}`, `{"paired":[[a,b],[c,d]]}`,
`{"strata":[[[a,b],[c,d]], ...]}`).

From JavaScript: `analyze(input)` returns the summary, every test and the effect
sizes; `fisherExact`, `barnardExact`, `boschlooExact`, `chiSquare`,
`fisherRxC`, `mantelHaenszel`, `mcnemar`, `effectSizes` and `tablesFromCSV` are
exported for direct use.

## Verification

`node --test *.test.mjs` (about 15 s). [`eval/reference.py`](eval/reference.py)
writes [`eval/reference.json`](eval/reference.json) with scipy 1.18.1 and
statsmodels 0.15.0 (used only to produce the file; nothing was ported):

- Fisher's p-values, all three alternatives, on 69 tables (9 fixed, 60 random):
  scipy to 1e-9; conditional MLE odds ratio and its interval to 1e-6.
- Pearson, Yates and G statistics and p-values; Woolf, Katz and Newcombe
  intervals: scipy and statsmodels to 1e-9 / 1e-6.
- r x c exact p-values on 16 tables: equal (1e-9) to plain enumeration of every
  table with the margins, a different algorithm written in the reference script.
- CMH (with and without correction), Mantel-Haenszel odds ratio and RGB
  interval, Breslow-Day and Tarone on 8 strata sets including Berkeley:
  statsmodels.
- McNemar exact and chi-square: statsmodels.
- R's documented values: tea tasting 0.2429, twins 0.0004652, job satisfaction
  0.7827, rabbits CMH 0.047 / exact 0.040 / one-sided 0.020, Berkeley CMH
  X² = 1.4269, p = 0.2323, common odds ratio 0.9047 (0.7719, 1.0603).
- Properties: each exact test's rejection region has probability at most 5% at
  99 values of the common risk (12 per group); Boschloo's one-sided p is never
  above Fisher's; the r x c test equals Fisher's on 2x2 tables and is unchanged
  by transposing or reordering.

**A discrepancy with scipy's `barnard_exact`.** Barnard's and Boschloo's
p-values are a maximum over the common risk, so the reference also evaluates
scipy's own objective on a 10,001-point grid; ours is never below it. In 22 of
the 272 Barnard p-values, scipy reports a lower number (for example
[[2, 15], [10, 3]]: scipy 0.000324, here 0.000348). In every one of the 22 the
cause is the same: the two-sided region keeps tables with |z| ≥ |z_obs|, and a
table whose z equals the observed one in exact rational arithmetic (checked
with Python's `fractions` for all 58 such tables) comes out one unit in the
last place smaller in floating point, so a plain `>=` leaves it out. This tool
counts statistics within a relative 1e-12 as tied. None of the 22 differences
came from scipy's optimiser stopping short. We report it as a discrepancy in
floating-point tie handling, with the reproduction in `eval/reference.py`; it
has not been reported upstream.

## Limits

- An association is not a cause; see the page's limits for confounding and
  clustered data.
- Barnard and Boschloo run up to 500 x 500 per group (`UNCONDITIONAL_LIMIT`);
  past that they are skipped with a note.
- The r x c exact test stops at 5 million steps or 6 seconds and falls back to
  20,000 random tables (seeded, with its standard error).
- Not implemented: ordered-category trend tests, exact risk-difference
  intervals, non-inferiority margins, sample-size planning.

## Files

`engine.mjs` (all methods, no imports), `cli.mjs`, `index.html`,
`example-data.mjs`, `usage.mjs` (local-only counters with an opt-out),
`data/` (Berkeley CSV and sources), `eval/` (reference generator, reference
values, the exact size study).

Statistical estimates from the counts you supply. **No warranty.** Not legal,
tax, financial or medical advice, and not a substitute for a statistician on a
study that matters. Not affiliated with the authors of the cited papers, the
University of California, or the scipy, statsmodels or R projects. Built with AI
assistance.
