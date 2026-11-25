# Probability calibration check: reliability diagram and Brier score decomposition

**When these forecasts said 70%, did it happen 70% of the time?** Paste yes/no
probability forecasts and what happened (a classifier's predicted
probabilities on a test set, a chance of rain, a default-risk score, a
pundit's or a model's win probabilities) and the tool reports:

- a **CORP reliability diagram** (Dimitriadis, Gneiting & Jordan 2021): the
  isotonic recalibration of the forecasts, drawn as a step function, with a
  **consistency band** showing where a calibrated forecaster's curve would
  fall with your sample size. No bin count to choose;
- the **Brier and log scores split exactly** into miscalibration (MCB),
  discrimination (DSC) and uncertainty (UNC), `score = MCB - DSC + UNC`;
- a **resampling test** of calibration that uses MCB as its statistic, the
  **observed against expected** count of events, **Spiegelhalter's z test**,
  and **Cox's calibration intercept and slope** (slope below 1: too extreme);
- the binned **expected calibration error** (ECE, MCE) and **Murphy (1973)
  decomposition**, for comparison with papers that use them;
- the **AUC**, and an **isotonic or Platt recalibration map** to apply to new
  forecasts, with a CSV of every forecast and its recalibrated values.

Live page: https://marisstella.app/probability-calibration/ (runs in the
browser; nothing is uploaded).

```
node cli.mjs data/nfl-elo-2010-2020.csv
node cli.mjs preds.csv --forecast p_default --outcome defaulted
node cli.mjs pop.csv --positive rain --percent --bins 20 --binning count
node cli.mjs preds.csv --csv > recalibrated.csv     # each forecast, isotonic and Platt values
node cli.mjs preds.csv --json                       # everything but the per-row arrays
```

Agents: `node platform/agents/tools.mjs describe probability-calibration`
prints the papers; `call probability-calibration analyze --input '{"p": [0.1, 0.4, ...], "y": [0, 1, ...]}'`
runs it, or pass `{"csv": "..."}` with optional `forecastColumn`,
`outcomeColumn`, `positive`, `bins`, `binning`, `resamples`, `level`, `seed`.
From JavaScript: `analyze(input)`, `pav(x, y)`, `corp(p, y, "brier" | "log")`,
`binned(p, y, {bins, binning})`, `spiegelhalter(p, y)`,
`calibrationSlope(p, y)`, `consistency(p, y, {resamples, seed})`,
`recalibrator(result, "isotonic" | "platt")`.

## How it works

**Pool-adjacent-violators.** Forecasts are sorted, equal forecasts pooled into
one block, and adjacent blocks merged while an earlier block's mean outcome is
at least the next one's (Ayer et al. 1955). The result is the non-decreasing
least-squares fit of outcomes on forecasts; because isotonic regression
minimises every Bregman loss at once, it is also the best order-preserving
recalibration under the log score.

**CORP decomposition.** With `c` the PAV fit and `r` the base rate:
`MCB = S(x) - S(c)`, `DSC = S(r) - S(c)`, `UNC = S(r)`. The identity
`S(x) = MCB - DSC + UNC` is exact by construction; what makes it useful is
that `S(c) <= S(x)` (so MCB >= 0) and `S(c) <= S(r)` (DSC >= 0), and that the
fit, unlike a binned estimate, does not depend on a tuning choice.

**Consistency band and test.** Outcomes are redrawn as Bernoulli(forecast),
the PAV fit redone, and the band is the pointwise 5% and 95% quantiles (or
2.5/97.5) of the refits at up to 400 forecast values. The p-value is
`(1 + #{MCB* >= MCB}) / (1 + resamples)`. The test with MCB as its statistic
is this tool's addition; the paper gives the bands. Randomness is a seeded
mulberry32 stream, so results reproduce.

**The rest.** Spiegelhalter's `Z = sum (y - p)(1 - 2p) / sqrt(sum (1 - 2p)^2 p(1 - p))`;
observed/expected `z = (O - E) / sqrt(sum p(1 - p))`; Cox's intercept and
slope by Newton-Raphson on `logit(y) ~ a + b logit(p)`, forecasts clipped to
`[1e-6, 1 - 1e-6]`; AUC by midranks; ECE as `sum_b (n_b/N) |ybar_b - pbar_b|`
over equal-width bins (the last bin includes 1) or equal-count bins.

## What the example shows

The bundled example is FiveThirtyEight's simple-Elo pre-game probability that
the home team wins, for the 2,930 NFL games of 2010-2020 that did not end in a
tie (`data/SOURCE.md`; FSL-1.1-MIT licence). Numbers from `eval/seasons.mjs`
(`eval/seasons.json`):

- Brier score 0.2196 against 0.2458 for always forecasting the base rate;
  MCB 0.0028 (1.3% of the score), DSC 0.0290, AUC 0.689.
- The resampling test finds no departure from the diagonal (p = 0.289 with 500
  resamples, 0.305 with 1,000), and the calibration slope is 0.947 ± 0.056.
- But home teams won 56.5% of games against an average forecast of 58.4%:
  1,655 wins against 1,711.2 expected, z = -2.24, p = 0.025. A constant
  overforecast spread over the whole range barely bends the isotonic curve,
  which is why the shape test misses what the count test sees.
- The shortfall is concentrated at the end: 52.3% home wins against 58.8%
  forecast in 2019 (z = -2.31) and 50.0% against 58.5% in 2020 (z = -3.02), a
  season played mostly in empty or limited-capacity stadiums. Through 2019
  alone the overall gap is not significant (p = 0.16). This is a description of
  these forecasts, not a finding about why home advantage moved.
- ECE on the same forecasts ranges from 0.019 to 0.043 across 5 to 30
  equal-width or equal-count bins; the CORP MCB has no such knob.

## Verification

`eval/reference.py` recomputes everything independently with scikit-learn
1.9.1, scipy 1.18.1 and numpy 2.5.3 (written from the formulas, not from
`engine.mjs`) on three cases: the NFL example, 600 overconfident forecasts on
a 0.1 grid (many ties), and a 12-row hand case. `engine.test.mjs` checks:

- Brier and log scores and both CORP decompositions match
  `IsotonicRegression`, `brier_score_loss` and `log_loss` to 1e-10, and the
  isotonic fit matches value for value (1e-12);
- AUC matches `roc_auc_score`; Cox intercept and slope match unpenalised
  `LogisticRegression` to 1e-6;
- Spiegelhalter and observed/expected z match to 1e-10, p-values (scipy
  `norm.sf`) to 1e-6; ECE, MCE and the Murphy terms match for 10 equal-width
  and 10 equal-count bins;
- a textbook PAV example, monotonicity and tie pooling on random data, the
  isotonic map's interpolation and clipping;
- calibrated simulated forecasts pass the resampling test and overconfident
  ones fail it, the band covers the diagonal, and a fixed seed reproduces.

```
node --test "*.test.mjs"
```

## Limits

- Calibration is not skill: forecasting the base rate is calibrated and
  useless. Read MCB with DSC and the AUC.
- The recalibration maps and "after recalibration" scores are fitted in
  sample, so they flatter. Fit on one period, check on the next.
- Tests assume outcomes independent given the forecasts; clustered outcomes
  (one storm, one borrower, one team-season) make p-values too small.
- Binary events only: no multiclass, ordinal or continuous calibration.
- Up to 200,000 forecasts.

## Credits

Implemented from the papers' mathematics (the `PAPERS` constant in
`engine.mjs`, the page and `--help` list them with DOIs). No third-party code
was ported. The R package `reliabilitydiag` by the CORP authors is the
reference implementation of the method; it was not used or consulted for code
here. Example data: FiveThirtyEight / ABC News, FSL-1.1-MIT licence.

No warranty. Statistical output from the data you supply, not legal, tax,
financial, medical or professional advice. Not affiliated with the authors of
the cited papers, FiveThirtyEight, ABC News or the NFL. FSL-1.1-MIT licence. Built with
AI assistance.
