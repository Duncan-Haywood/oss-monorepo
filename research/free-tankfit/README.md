# Does the overflow twin's lead over ARX survive refitting? Yes when the fit sees almost all the training data (gap 0.13 V, 100% of refits); with 75% or less of it the gap shrinks to 0.07 V and the twin wins only 84 to 90% of refits

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-tankfit/

A free-choice follow-up to [`free-tankci`](../free-tankci), whose first next step is "refit twin and ARX on resampled training segments to add fit variance to the interval". That project bootstrapped only the test trace; the models were fitted once. Here both the 8-parameter overflow twin and linear ARX 4/4 are refitted on random contiguous windows of the real Cascaded Tanks training trace (Schoukens et al. 2016) and scored on the same test trace, with the scoring of [`free-tanktwin`](../free-tanktwin). Relates to the sim-to-real and system-identification themes of ARPG and CAIRO; no lab code is reused. Produced with AI assistance (Claude).

## Data and method

Data: the benchmark's 1024-sample training trace and 1024-sample test trace, loaded with `nonlinear-benchmarks` (installed with `--no-deps`; its `progressbar` import was stubbed because that wheel failed to build here). For window length L in {512, 768, 896}, 100 start positions are drawn uniformly (seed 0), both models are refitted on `[start, start+L)`, and test RMSE is computed after the 50-sample initialisation window as in `free-tanktwin` (the twin re-estimates only its two initial states). Statistic: gap = RMSE(ARX 4/4) - RMSE(twin). Windows overlap heavily (at L = 896 only 129 distinct starts exist), so the 100 refits are not independent; the spread understates what fresh training runs would give.

## Results (`experiments/results.txt`, figure `experiments/gap_by_window.png`)

The full-trace fit reproduces `free-tanktwin` (twin 0.528 V, ARX 0.655 V; a run-time check, not only a test).

| training window | twin RMSE mean (sd) | ARX 4/4 mean (sd) | gap mean | gap 2.5 to 97.5% | twin beats ARX |
|---|---|---|---|---|---|
| 896 (87.5%) | 0.518 (0.012) | 0.651 (0.004) | 0.133 | 0.108 to 0.152 | 100% |
| 768 (75%) | 0.616 (0.071) | 0.681 (0.048) | 0.066 | -0.004 to 0.169 | 90% |
| 512 (50%) | 0.671 (0.083) | 0.741 (0.090) | 0.070 | -0.023 to 0.309 | 84% |

- With nearly all the data the twin's lead is stable and equals the headline (0.13 V). The `free-tankci` interval (0.06 to 0.20 V) is therefore not undone by fit variance in this regime.
- Drop a quarter or more of the training trace and the twin degrades much more than ARX does in relative spread (sd 0.07 to 0.08 V against 0.05 to 0.09 V), the mean gap halves, and in 10 to 16% of refits ARX wins. The twin's advantage depends on the training trace covering the operating range, which fits the earlier finding that most of its error sits where the test output exceeds the training range.
- At L = 768 and 896 the twin's test RMSE falls with later start (correlation of start with twin RMSE: -0.52 and -0.87), i.e. the end of the training trace matters most; this is a correlation over overlapping windows, not a causal test.

## Limitations

- Contiguous windows of one training trace are a proxy for refitting on new experiments: they overlap, and shrinking the data confounds fit variance with less information. Only the L = 896 row is close to "the same data, different fit".
- Optimiser start and bounds were fixed (`fit_twin` defaults); no multi-start. The overflow gain still sits near its bound, see `free-tanktwin`.
- Only the two headline models; NARX variants and a second rig are not refitted.
- 100 refits per length, one seed.

## Reproduce

```
PY=$(python3 platform/ci/pyenv.py pytest numpy scipy matplotlib)
"$PY" -m pytest -q research/free-tankfit/tests
"$PY" research/free-tankfit/experiments/run.py      # about 12 min, needs nonlinear-benchmarks (downloads the data)
"$PY" research/free-tankfit/experiments/figure.py
```

## Next steps

- Block-bootstrap the training residuals to refit on resampled data of full length.
- Multi-start fits to separate optimiser variance from data variance.
- Repeat on a second public rig (Silverbox or Wiener-Hammerstein).

## Outside dependencies
numpy, scipy, matplotlib; `nonlinear-benchmarks` for the data (`run.py` only). Reuses `../free-tanktwin/tanktwin.py`.
